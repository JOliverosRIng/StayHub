# Task 03 — Arranque nativo con Users real — Resultado

Estado: COMPLETA

Fecha: 2026-09-30
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones usadas: Node `v22.22.2`, npm `10.9.7`. El `engines` pide `>=20 <21`; se registra la
diferencia (solo warnings de npm). Prisma Client `6.19.0`. Engine de contenedores: `podman` +
`podman-compose`. No se imprimieron secretos ni tokens en este informe.

## 1. Dependencias leídas y estado comprobado

- `agents/integracion/CONTEXTO.md`, el índice `PLAN.md` y `task-03/PLAN.md`.
- **Dependencia task-02**: leído `task-02/resultado.md`; `Estado: COMPLETA` y fila 02 en COMPLETA.
  Se reutilizan `scripts/lib/dev-env.mjs` (`ensureDevEnvironment`, `SECRET_FILES`, constantes B1),
  `.env` persistente y `secrets/` (incluida `gateway-private.pem`).
- Estado real confirmado: el modo nativo anterior usaba `compose.test.yml` (una sola base
  `auth_test`), generaba claves efímeras y arrancaba `users-stub`. Auth y Users exponen
  `/health/live` y `/health/ready`; Users valida migraciones en `ready` y monta Swagger en `/docs`
  con `NODE_ENV=development`.

## 2. Archivos cambiados y decisiones

1. `infra/docker/dev/compose.deps.yml` (nuevo) — tres servicios con volúmenes persistentes:
   `auth-db` (postgres:16-alpine, `auth_db`, puerto `55433`), `users-db` (postgres:16-alpine,
   `users_db`, puerto `55434`) y `auth-redis` (puerto `56380`). Puertos configurables por entorno.
   Proyecto `stayhub-auth-users-dev`, distinto del harness de pruebas (`stayhub-auth-test`,
   `55432/56379`) para no reutilizar ni detener bases de pruebas.
2. `scripts/dev-auth-swagger.mjs` — modo nativo reescrito:
   - Reutiliza la configuración persistente vía `ensureDevEnvironment`; no genera claves nuevas.
   - Levanta las dependencias con `compose.deps.yml`, aplica `prisma:auth:generate`,
     `prisma:users:generate` y compila con `build:auth`/`build:users` (si falta `dist` o con
     `--build`).
   - Aplica migraciones de Auth (`prisma migrate deploy`) y de Users (`scripts/users-migrate.cjs`).
   - Arranca `users-service` (3002) y `auth-service` (3001) reales y espera readiness de ambos.
   - Firma el service JWT con `secrets/gateway-private.pem` (kid `gateway-dev-2026-01`,
     iss `stayhub-dev-gateway`, aud `stayhub-auth-service-dev`, scope `auth:invoke`).
   - `--users-port` ahora **falla** con mensaje explicativo (Users real es fijo en 3002).
   - `--down-deps` baja las dependencias **sin** `-v` (conserva volúmenes) y recibe las variables
     de `up` para poder interpolar el Compose.
   - El modo `--service-container` no cambia de comportamiento (reservado a task-04).
3. `apps/users-service/src/interfaces/openapi/openapi.factory.ts` — el server de Swagger de Users es
   configurable por `USERS_SWAGGER_SERVER_URL` (por defecto `http://users-service:3002`). El script
   nativo lo fija a `http://127.0.0.1:3002` para que "Try it out" apunte al origen correcto. El
   contrato versionado no cambia (validado sin drift).
4. `docs/dev-swagger.md` — reescrito para el modo nativo real: pasos, flags (sin `--users-port`),
   dos tokens (service JWT de Auth y `accessToken` de login para Users), URLs de ambos Swagger,
   flujo completo con perfil y limpieza. Sección de contenedores marcada como task-04.
5. `apps/auth-service/README.md` y `apps/users-service/README.md` — secciones de prueba manual
   actualizadas al arranque nativo con Users real y al bearer `accessToken`.

## 3. Arranque nativo y dependencias

- Contenedores creados: `stayhub-auth-users-dev_auth-db_1`,
  `stayhub-auth-users-dev_users-db_1`, `stayhub-auth-users-dev_auth-redis_1`.
- Volúmenes conservados: `stayhub-auth-users-dev_auth-dev-db-data`,
  `stayhub-auth-users-dev_users-dev-db-data`.
- Reinicio: volver a ejecutar `npm run dev:swagger` reutiliza contenedores/volúmenes y `.env`; no
  rota claves. Para parar las dependencias sin borrar datos: `Ctrl+C` con `--down-deps`, o
  `podman-compose -p stayhub-auth-users-dev -f infra/docker/dev/compose.deps.yml down`.

## 4. Comandos, códigos de salida y resultados reales

Arranque nativo (`node scripts/dev-auth-swagger.mjs`, en segundo plano):

```text
[dev-auth] modo=nativo engine=podman auth=3001 users=3002
migraciones Auth: 4 aplicadas; migraciones Users: aplicadas
auth  /health/ready -> 200
users /health/ready -> 200
auth  /docs -> 200 ; users /docs -> 200
```

Recorrido real (curl, identidades sintéticas `example.test`):

| Paso | Petición | Resultado |
|---|---|---|
| Registro | `POST http://127.0.0.1:3001/internal/v1/registrations` + `Idempotency-Key` UUID | `201` `{id,name,email,role}` |
| Login | `POST http://127.0.0.1:3001/internal/v1/login` | `200`, `principal.userId` y `accessToken` |
| Perfil propio | `GET http://127.0.0.1:3002/internal/v1/users/{id}/profile` (bearer accessToken) | `200` perfil con `version:1` |
| Perfil ajeno | mismo GET con `userId` distinto | `403` |
| Service JWT en perfil | GET perfil con el service JWT | `401` |
| Actualizar perfil | `PATCH .../profile` multipart `{"phone":"+3412345678","expectedVersion":1}` | `200`, `version:2` |
| Versión obsoleta | mismo PATCH con `expectedVersion:1` | `409 VERSION_CONFLICT` |

Persistencia tras reinicio (parar con `Ctrl+C`, relanzar con `--skip-deps`):

```text
login del mismo correo -> 200, mismo userId, sessionId nuevo
GET perfil -> 200 con phone "+3412345678" y version 2
sha256 de .env y secrets/* idénticos antes/después -> sin rotación
```

Flags y cierre:

```sh
node scripts/dev-auth-swagger.mjs --users-port 4010
# exit 1: "--users-port se retiró: ..."
node scripts/dev-auth-swagger.mjs --down-deps   # al salir:
# contenedores retirados, volúmenes conservados, procesos Node detenidos
curl users /docs-json | servers -> [{"url":"http://127.0.0.1:3002"}]
curl auth  /docs-json | servers -> [{"url":"/"},{"url":"http://auth-service:3001"}]
```

Validaciones:

```sh
npm run typecheck:auth      # exit 0
npm run lint:auth           # exit 0
npm run typecheck:users     # exit 0
npm run lint:users          # exit 0
npm run openapi:auth:check  # 11 tests, 0 fallos, exit 0
node scripts/validate-users-openapi.mjs   # sin drift, exit 0
npm run test:auth:unit      # 18 suites, 146 tests, 0 fallos
npm run test:users:unit     # 9 suites, 82 tests, 0 fallos
npm run test:users:security # 3 suites, 35 tests, 0 fallos
```

## 5. Escenarios acreditados y pendientes

Acreditados:

- Arranque nativo con Auth y Users reales, migraciones y readiness de ambos.
- Registro→login→perfil de extremo a extremo; ownership (403) y separación de tokens (401).
- PATCH multipart con `expectedVersion` y conflicto de versión.
- Reinicio conservando usuario y configuración criptográfica (sin rotación de secretos).
- `--users-port` retirado con error; `--down-deps` conserva volúmenes; Swagger apunta al origen
  correcto en ambos servicios.

Pendientes / fuera de alcance (no bloquean task-03):

- Modo `--service-container` con Users real (sigue usando el stub): task-04.
- Harness de integración automatizado sin Gateway y suites cross-service: task-05/task-06.
- El arranque nativo del script no se ejecutó desde un runner de Jest; la evidencia es la ejecución
  real registrada arriba. La automatización corresponde a task-05.

## 6. Recursos temporales creados y limpieza

- Contenedores `stayhub-auth-users-dev_*` y volúmenes de desarrollo creados y dejados listos para
  reutilizar (los volúmenes conservan datos). El último arranque usó `--down-deps`: contenedores
  retirados, volúmenes conservados.
- Usuarios sintéticos `flow-*@example.test` en `users_db` de desarrollo (base desechable de
  desarrollo; no es la base de pruebas 55432 ni datos del usuario). No se borraron datos previos.
- No se tocaron stubs de pruebas ni dobles aislados.

## 7. Instrucciones para task-04 (no ejecutada)

- Reutilizar `.env`/`secrets/` de task-02 y `scripts/lib/dev-env.mjs`; no generar claves nuevas.
- Actualizar `infra/docker/auth/compose.dev.yml` y la sección contenedor de
  `scripts/dev-auth-swagger.mjs`: eliminar `users-stub`, arrancar `users-service` real con
  migraciones y `users-service: service_healthy`, y pasar la interpolación `${USERS_...}` desde
  `.env`.
- Aplicar a `--service-container` la ayuda de Swagger de task-03 (dos tokens y dos URLs).
- No usar `down -v` al detener desarrollo; conservar datos y secretos.
- Users real escucha en el puerto interno 3002; el override de desarrollo publica Auth 3001 y Users
  3002 solo en `127.0.0.1`.
