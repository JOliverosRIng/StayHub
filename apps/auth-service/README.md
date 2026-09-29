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

## Prueba manual con Swagger

> Guía completa (requisitos, `npm ci`, por qué se genera el JWT, flujo y troubleshooting):
> [docs/dev-swagger.md](../../docs/dev-swagger.md).

`npm run dev:swagger` levanta un entorno completo para probar la API a mano. Hay dos modos:

**Nativo (por defecto):** Auth corre con `node dist`; solo Postgres/Redis van en contenedor.

1. Reutiliza (o levanta) PostgreSQL/Redis de `compose.test.yml`.
2. Genera claves RSA y secretos efímeros, aplica migraciones y arranca un stub en memoria de Users.
3. Arranca auth-service con `NODE_ENV=development`; Swagger se publica en `/docs`.
4. Imprime un service JWT listo para pegar en "Authorize".

**Contenedor (`--service-container`):** auth-service, migraciones, Postgres/Redis y el stub de Users corren
en contenedores mediante `compose.dev.yml` (publica `127.0.0.1:3001` y usa `NODE_ENV=development`).

```sh
npm run dev:swagger                    # nativo
npm run dev:swagger:docker             # todo en contenedores (equivale a --service-container)
npm run dev:swagger -- --port 3001 --users-port 4010
npm run dev:swagger -- --skip-deps     # usa DEV_AUTH_DATABASE_URL/DEV_AUTH_REDIS_URL
npm run dev:swagger -- --down-deps     # baja Postgres/Redis al salir
```

Equivalente manual del modo contenedor:

```sh
podman-compose -f docker-compose.yml -f infra/docker/auth/compose.dev.yml -p stayhub-auth-dev up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/docs   # 200
```

Flujo recomendado: `POST /internal/v1/registrations` (con `Idempotency-Key` UUID) →
`POST /internal/v1/login` → `POST /internal/v1/sessions/refresh` → `POST /internal/v1/sessions/validate`.
El stub de Users es en memoria: los usuarios se pierden al reiniciar. `Ctrl+C` detiene todo y, en modo
contenedor, elimina los recursos del proyecto `stayhub-auth-dev`.

El servidor de la UI se toma de `AUTH_SWAGGER_SERVER_URL` (solo aplica en `development`). Por defecto es `/`
(relativo al origen), lo que evita CORS al abrir la UI desde `localhost` o `127.0.0.1`. Si necesitas un host
concreto, define por ejemplo `AUTH_SWAGGER_SERVER_URL=https://auth.example.test`.




