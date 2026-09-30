# StayHub auth-service

Servicio interno NestJS responsable exclusivamente de credenciales, coordinación durable de
registro, sesiones y tokens. Escucha en el puerto interno `3001`; no debe publicarse al host.

## Límites

- Persiste solo `Credential`, `Registration`, `Session` y `RefreshToken` en `auth_db`.
- No persiste correo, nombre, perfil, preferencias, foto ni rol vigente de Users.
- Consume Users por REST autenticado con un service JWT de audiencia y clave independientes.
- PostgreSQL es autoritativo para sesiones; Redis se limita a contadores y caché acotada.

## Comandos

```powershell
npm ci
npm run prisma:generate
npm run build
npm run lint
npm run typecheck
npm test
```

Las migraciones productivas se aplican con `npm run prisma:migrate:deploy`. `prisma db push` no
forma parte del arranque ni de los scripts del servicio.

## Configuración

Todas las variables están enumeradas en `/.env.example`. El arranque falla si falta una URL de
base/Redis, un parámetro criptográfico, una clave, issuer/audience/scope, configuración de
sesión/reconciliación o endpoint OTLP. Los secretos reales y certificados nunca se versionan.

## Contenedores e integración

La imagen multi-stage (`infra/docker/auth/Dockerfile`) se construye con `--target runtime`; arranca con
`node dist/main.js` como usuario `stayhub` (no root), expone `3001` solo en la red interna y aplica las
migraciones `001–004` antes de declarar `ready`. El runtime instala `openssl` (requerido por Prisma) y
usa `argon2` nativo.

El harness `test/integration/auth-compose.spec.ts` (proyecto `test:cross-service`) detecta `docker` o
`podman`, genera claves y secretos efímeros, levanta `docker-compose.yml` con un nombre de proyecto
único y verifica: sin puertos publicados, migración previa al tráfico, detección de esquema incompleto
(`ready` 503), `live` vivo con Redis caído, reinicio sin pérdida de datos y OTLP ausente sin bloquear
`ready`. Limpia en `finally` contenedores, redes, volúmenes e imágenes del proyecto de prueba.

```sh
podman build --target runtime -f infra/docker/auth/Dockerfile .
npm run test:cross-service --workspace @stayhub/auth-service -- --runTestsByPath test/integration/auth-compose.spec.ts
```

Los specs cross-service que necesitan G1/G2 llaman a `requireCrossServiceProviders()`; el harness de
compose no requiere esos proveedores.

## Harness de integración Auth↔Users sin Gateway

`npm run test:auth-users` (raíz) ejecuta `jest.auth-users.config.ts` contra **Auth y Users reales**
por HTTP, sin Gateway y sin el stub de Users. Es la verificación de la integración Auth↔Users; la
configuración dedicada enumera explícitamente sus suites y no depende del descubrimiento de Jest.
Suites (9 suites, 38 tests; unos 4 min, cada suite aprovisiona su propio entorno):

| Suite | Escenarios |
|---|---|
| `test/integration/auth-users-smoke.spec.ts` | readiness de ambos, registro por Auth y login |
| `test/contract/users-registration.consumer.spec.ts` | respuestas reales de create/GET/activate/cancel conformes al OpenAPI de Users; INT-16 (scope 403, clave/kid 401) |
| `test/contract/users-login-identity.consumer.spec.ts` | INT-08 lookup `{userId, role, status: ACTIVE}`; ausente/PENDING/CANCELLED indistinguibles; INT-16 |
| `test/integration/cross-service-registration.spec.ts` | INT-01–05 (GUEST/OWNER, idempotencia, conflictos, concurrencia) |
| `test/integration/cross-service-login.spec.ts` | INT-06, INT-07, INT-12 (refresh, replay 401, sesión revocada en Auth) |
| `test/integration/cross-service-profile.spec.ts` | INT-09–11 con el `accessToken` del login real (PATCH multipart con `expectedVersion`, cambio de email, ownership 403) |
| `test/integration/cross-service-recovery.spec.ts` | INT-13 (Users caído → 503 sin confirmar) e INT-14 (respuestas perdidas tras la escritura) |
| `test/integration/cross-service-reconciliation.spec.ts` | INT-15 con el reconciliador real (intervalo 1 s, TTL vencido en la base desechable) |
| `test/integration/cross-service-restart.spec.ts` | INT-17: reinicio de procesos, PostgreSQL y Redis sin perder usuarios ni sesiones |

Estas suites están excluidas del Jest ordinario (`crossServicePatterns` en `jest.config.ts`) y solo
se ejecutan con este comando.

Utilidades del harness (`test/helpers/auth-users-harness.ts`, `auth-users-flows.ts`,
`users-fault-proxy.ts`): `provisionAuthUsersHarness({ authEnv, usersFaultProxy })` permite
variables extra solo para Auth y un **proxy de fallos** entre Auth y Users real. El proxy puede
descartar la respuesta tras la escritura (`drop-response`) o cortar sin reenviar (`refuse`); nunca
fabrica respuestas. También ofrece `stopUsers/startUsers`, `stopAuth/startAuth`,
`restartInfrastructure()`, tokens de servicio hacia Users (`usersServiceToken`) y consultas de
inspección a las bases desechables (`queryAuthDb`/`queryUsersDb`), solo desde las pruebas.

El harness ejecuta `dist/`: tras cambiar `src/`, recompila con `npm run build:auth` y
`npm run build:users` (solo compila automáticamente si falta `dist`).

Aislamiento (no usa datos del desarrollador ni las bases de pruebas 55432/56379):

- Aprovisiona **dos PostgreSQL 16 desechables** (Auth con base `auth_test`; Users con `users_db`) y
  un **Redis desechable** en **DB 15**, en puertos libres y con nombres únicos.
- Arranca ambos servicios con la **configuración persistente** `.env`/`secrets/` (correspondencia B1); solo
  sobrescribe las URLs de base/Redis. Si falta o es incoherente, falla con la instrucción exacta.
- Ejecuta migraciones reales de ambos servicios y arranca `node dist` para Auth y Users como
  **procesos separados**. Requiere el puerto fijo `3002` libre para Users y un engine `docker` o
  `podman`; en caso contrario falla de forma explícita, sin resultados verdes.
- Registra los contenedores que crea y limpia **exclusivamente esos recursos** (procesos y
  contenedores) incluso si el arranque falla; nunca toca el stack de desarrollo.

```sh
npm run env:auth:dev        # una vez: genera .env y secrets/ persistentes (B1)
npm run test:auth-users     # harness Auth↔Users real, sin Gateway
```

Variables opcionales del harness: `AUTH_USERS_TEST_POSTGRES_IMAGE` (por defecto `postgres:16-alpine`)
y `AUTH_USERS_TEST_REDIS_IMAGE` (por defecto `redis:7-alpine`). El harness no usa
`CROSS_SERVICE_GATEWAY_URL`.

Reintentos y compensación observados por estas suites: las llamadas idempotentes a Users hacen 2
intentos (solo ante 5xx/red). Si un registro interrumpido vence su TTL y la cancelación en Users
falla, el reconciliador consulta `GET /internal/v1/registrations/{id}`. Solo un 404 autenticado se
toma como ausencia confirmada y cierra el registro como `CANCELLED`; 401/403/5xx/red lo mantienen
en `COMPENSATING`. Si la identidad llega tarde a Users, queda `PENDING` y sin login; su correo sigue
reservado en Users (límite conocido: liberarlo requeriría un protocolo nuevo).

Suites ordinarias de integración/contrato de Auth: exportan `TEST_AUTH_DATABASE_URL` (base terminada
en `_test`), `TEST_AUTH_REDIS_URL` (DB 15) y `AUTH_TEST_ALLOW_CLEANUP=true`, apuntando a recursos
desechables.

## Prueba manual con Swagger

> Guía completa (requisitos, `npm ci`, por qué se genera el JWT, flujo y troubleshooting):
> [docs/dev-swagger.md](../../docs/dev-swagger.md).

`npm run dev:swagger` levanta un entorno completo para probar ambos servicios a mano. Hay dos modos:

**Nativo (por defecto):** Auth y **Users reales** corren con `node dist`; PostgreSQL (uno por
servicio) y Redis de Auth van en contenedores persistentes (`infra/docker/dev/compose.deps.yml`).

1. Reutiliza la configuración persistente de `npm run env:auth:dev` (`.env` y `secrets/`), sin
   rotar claves.
2. Levanta PostgreSQL de Auth (55433), PostgreSQL de Users (55434) y Redis (56380), aplica
   migraciones de ambos servicios y espera readiness de los dos.
3. Arranca `users-service` (3002) y `auth-service` (3001) con `NODE_ENV=development`; cada uno
   publica Swagger en `/docs`.
4. Imprime un service JWT de Auth, firmado con la clave persistente Gateway→Auth, y las dos URLs.

**Contenedor (`--service-container`):** Auth, Users real, sus migraciones y PostgreSQL/Redis corren
en contenedores mediante `compose.dev.yml`. No arranca ningún stub; publica Auth en
`127.0.0.1:3001` y Users en `127.0.0.1:3002`, y espera Users sano antes de arrancar Auth. Usa la
configuración persistente de `.env`/`secrets/` y conserva volúmenes al detenerse.

```sh
npm run dev:swagger                    # nativo (Auth + Users reales)
npm run dev:swagger:docker             # todo en contenedores (equivale a --service-container)
npm run dev:swagger -- --port 3001     # puerto de Auth
npm run dev:swagger -- --skip-deps     # no levanta contenedores; usa DEV_*_URL
npm run dev:swagger -- --down-deps     # baja PostgreSQL/Redis al salir (conserva volúmenes)
npm run dev:swagger -- --build         # fuerza la compilación de ambos servicios
```

Equivalente manual del modo contenedor:

```sh
podman-compose -f docker-compose.yml -f infra/docker/auth/compose.dev.yml -p stayhub-auth-dev up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/docs   # 200
```

Flujo nativo recomendado: `POST /internal/v1/registrations` (con `Idempotency-Key` UUID) →
`POST /internal/v1/login` en Auth; usa el `accessToken` del login como bearer en
`GET/PATCH /internal/v1/users/{userId}/profile` de Users (`http://127.0.0.1:3002/docs`). El flag
`--users-port` ya no existe: Users real escucha siempre en 3002. Los datos persisten en los
volúmenes de desarrollo; `Ctrl+C` detiene solo los procesos Node y, en modo contenedor, elimina
los recursos del proyecto `stayhub-auth-dev`.

El servidor de la UI se toma de `AUTH_SWAGGER_SERVER_URL` (solo aplica en `development`). Por defecto es `/`
(relativo al origen), lo que evita CORS al abrir la UI desde `localhost` o `127.0.0.1`. Si necesitas un host
concreto, define por ejemplo `AUTH_SWAGGER_SERVER_URL=https://auth.example.test`.




