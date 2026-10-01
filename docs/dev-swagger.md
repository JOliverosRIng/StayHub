# Probar Gateway, Auth y Users con Swagger

Guía rápida para levantar API Gateway, Auth y Users reales y probarlos desde Swagger UI. Todo lo
gestiona `scripts/dev-auth-swagger.mjs`. El Gateway es la entrada pública (HTTPS 8080, `/api/v1`);
Auth y Users siguen publicados en `127.0.0.1` solo para probar sus rutas internas directamente.

## Requisitos

- Node.js (se recomienda 20; con 22 solo aparecen avisos `EBADENGINE` de `engines`, no errores).
- Docker o Podman (el script autodetecta `docker` y, si no, `podman`).
- Haber instalado dependencias **una vez** (ver abajo).

## `npm ci` vs `npm run dev:swagger`

Son dos cosas distintas y **no** se ejecutan juntas cada vez:

- **`npm ci`** instala las dependencias exactas del lockfile. Se ejecuta:
  - la primera vez tras clonar,
  - cuando cambia `package.json` o `package-lock.json`,
  - si borras `node_modules`.
  No se ejecuta en cada prueba. También sirve `npm install` cuando añades dependencias.
- **`npm run dev:swagger`** asume que las dependencias ya están instaladas. En modo nativo hace:
  1. reutiliza (o genera y valida) la configuración persistente `.env` y `secrets/`,
  2. levanta PostgreSQL de Auth, PostgreSQL de Users y Redis en contenedores con volúmenes,
  3. `prisma:auth:generate` y `prisma:users:generate`,
  4. `build:auth` y `build:users` solo si falta algún `dist` (o con `--build`),
  5. aplica las migraciones de ambos servicios,
  6. arranca `users-service` (3002), `auth-service` (3001) y `api-gateway` (HTTPS 8080) con
     `NODE_ENV=development`,
  7. espera readiness de los tres e imprime las URLs de Swagger y el service JWT.

```sh
npm ci                      # una sola vez (o al cambiar dependencias)
npm run env:auth:dev        # opcional: genera/valida .env y secrets/ por adelantado
npm run dev:swagger         # Auth + Users reales nativos; DB/Redis en contenedor
npm run dev:swagger:docker  # Auth + Users + migraciones + DB/Redis en contenedores
```

Flags útiles:

| Flag | Efecto |
|---|---|
| `--port <n>` | Puerto HTTP de Auth (por defecto 3001). |
| `--service-container` | Equivale a `dev:swagger:docker` (Auth, Users real, migraciones y DB/Redis en contenedores). |
| `--skip-deps` | No levanta contenedores; usa `DEV_AUTH_DATABASE_URL`, `DEV_USERS_DATABASE_URL` y `DEV_AUTH_REDIS_URL`. |
| `--down-deps` | Baja PostgreSQL/Redis al salir (conserva los volúmenes). |
| `--build` | Fuerza la compilación de Auth y Users. |

Puertos de dependencias configurables por entorno (por defecto): `DEV_AUTH_DB_PORT=55433`,
`DEV_USERS_DB_PORT=55434`, `DEV_REDIS_PORT=56380`, `DEV_GATEWAY_REDIS_PORT=56381`. Son distintos del harness de pruebas
(55432/56379) para no reutilizar ni detener bases de pruebas.

El flag `--users-port` **se retiró**: el modo nativo usa `users-service` real en el puerto fijo 3002.

## Gateway (entrada pública)

El script genera una sola vez en `secrets/` el material propio del Gateway, **sin tocar `.env`**:
`gateway-tls-cert.pem`/`gateway-tls-key.pem` (autofirmado para `localhost` y `127.0.0.1`) y
`gateway-redis-password.txt`. Las variables `GATEWAY_*` se derivan en cada arranque de la
configuración de Auth, así que siempre coinciden:

- Service JWT Gateway→Auth: firmado con `secrets/gateway-private.pem`; kid, issuer, audience y
  scope salen de `AUTH_INBOUND_SERVICE_*`.
- Access JWT de usuario: se verifica con `secrets/access-public.pem` y `AUTH_JWT_ISSUER`/`_AUDIENCE`.
- Destinos: `auth-service:3001`/`users-service:3002` en contenedor; `127.0.0.1` en nativo.

En el Gateway **no se usa el service JWT**: él mismo lo firma hacia Auth. El navegador pedirá
aceptar el certificado autofirmado la primera vez que abras `https://127.0.0.1:8080/docs`
(o usa `curl --cacert secrets/gateway-tls-cert.pem`).

Flujo en `https://127.0.0.1:8080/docs`:

1. `POST /api/v1/auth/register` con header `Idempotency-Key` (UUID) y el mismo body de abajo → `201`.
2. `POST /api/v1/auth/login` → `200` con `accessToken` y `user { userId, sessionId, role }`. El
   refresh **no** va en el cuerpo: llega como cookie `stayhub_refresh` (`HttpOnly; Secure;
   SameSite=Strict; Path=/api/v1/auth/refresh`).
3. Authorize con el `accessToken`; `GET /api/v1/auth/validate` → `200`.
4. `POST /api/v1/auth/refresh` (usa la cookie) → `200` y cookie nueva. Reusar la anterior → `401`
   y la sesión queda revocada.
5. `GET /api/v1/users/{userId}/profile` → `200`; con otro `userId` → `403`.

Límites de borde (Redis del Gateway): 10 registros/10 min y 30 logins/5 min por origen → `429`
con `Retry-After`. Auth o Redis del Gateway caídos → `503`.

## Dos tokens distintos (rutas internas, sin Gateway)

- **Service JWT (Auth).** Las rutas internas de Auth no son públicas y exigen
  `Authorization: Bearer <service JWT>`: las llamaría el Gateway. El script firma uno con el par
  persistente Gateway→Auth (`secrets/gateway-private.pem`, kid `gateway-dev-2026-01`,
  iss `stayhub-dev-gateway`, aud `stayhub-auth-service-dev`, scope `auth:invoke`) y lo imprime.
- **accessToken (Users).** El `accessToken` que devuelve `POST /internal/v1/login` de Auth es un
  bearer de usuario. Se usa contra Users para `GET/PATCH /internal/v1/users/{userId}/profile`. No
  se firma a mano: se obtiene del login real.

## URLs

| Recurso | URL |
|---|---|
| Gateway Swagger UI | `https://127.0.0.1:8080/docs` |
| Gateway API pública | `https://127.0.0.1:8080/api/v1` |
| Gateway Health | `https://127.0.0.1:8080/health/live`, `/health/ready` |
| Auth Swagger UI | `http://127.0.0.1:3001/docs` (**no** `/api`) |
| Auth OpenAPI JSON | `http://127.0.0.1:3001/docs-json` |
| Auth Health | `http://127.0.0.1:3001/health/live`, `/health/ready` |
| Users Swagger UI | `http://127.0.0.1:3002/docs` |
| Users OpenAPI JSON | `http://127.0.0.1:3002/docs-json` |
| Users Health | `http://127.0.0.1:3002/health/live`, `/health/ready` |

En modo nativo el server de "Try it out" de Auth es `/` (`AUTH_SWAGGER_SERVER_URL`) y el de Users es
`http://127.0.0.1:3002` (`USERS_SWAGGER_SERVER_URL`), así que ambos apuntan al origen correcto.

## Flujo de prueba (campos exactos)

1. **Auth — Authorize** (arriba a la derecha): pega el service JWT, sin la palabra `Bearer`.

2. **`POST /internal/v1/registrations`**
   - Header `Idempotency-Key`: un UUID, por ejemplo `3f2504e0-4f89-41d3-9a0c-0305e82c3301`.
   - Body:
     ```json
     {
       "name": "Ada Lovelace",
       "email": "ada@example.test",
       "password": "correct horse battery",
       "role": "GUEST"
     }
     ```
   - Respuesta `201`: `{"id","name","email","role"}`.
   - Reglas: `name` 2–100, `email` válido, `password` 8–128 exacta, `role` `GUEST` u `OWNER`
     (`ADMIN` → 400). Cada intento usa una `Idempotency-Key` nueva.

3. **`POST /internal/v1/login`**
   - Body: `{"email":"ada@example.test","password":"correct horse battery"}`.
   - Respuesta `200` con `accessToken`, `refreshToken`, `expiresIn`, `absoluteExpiresAt` y
     `principal { userId, sessionId, role }`.

4. **`POST /internal/v1/sessions/refresh`**
   - Body: **solo** `{"refreshToken":"..."}` (el valor de la respuesta de login).

5. **`POST /internal/v1/sessions/validate`**
   - Body: exactamente el `principal` del login, **sin invertir**:
     ```json
     {
       "sessionId": "<principal.sessionId>",
       "userId": "<principal.userId>"
     }
     ```
   - Respuesta `200`: `{"active":true,"role":"GUEST"}`.

6. **Users — Authorize**: abre `http://127.0.0.1:3002/docs` y pega el `accessToken` del login
   (sin la palabra `Bearer`).

7. **`GET /internal/v1/users/{userId}/profile`** con `userId = principal.userId`.
   - Respuesta `200`: perfil con `version`, `phone`, `preferences`, `photoUrl`.

8. **`PATCH /internal/v1/users/{userId}/profile`** (`multipart/form-data`): campo `profile` con el
   JSON y el `expectedVersion` actual (obtenido del GET), por ejemplo
   `{"phone":"+3412345678","expectedVersion":1}`. Una versión obsoleta devuelve `409`.

Mapeo mental: `principal.sessionId`/`principal.userId` → `validate`; `refreshToken` → `refresh`;
`accessToken` → Users perfil. El `accessToken` **no** se envía a las rutas internas de Auth.

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `/api` o `/` dan 404 | Swagger está en `/docs`. |
| 401 en rutas internas de Auth | Falta el service JWT o expiró: vuelve a copiarlo del script. |
| 401 en `validate` | `sessionId`/`userId` invertidos, sesión revocada (replay) o reiniciaste Auth. |
| 401 en el perfil de Users | Falta el `accessToken` real o Auth no está `ready`. |
| 403 en el perfil de Users | El `userId` de la URL no es el dueño del token. |
| 503 | DB, Redis o Users no están arriba; revisa `health/ready` de cada servicio. |
| Puerto de dependencia ocupado | Cambia `DEV_AUTH_DB_PORT`/`DEV_USERS_DB_PORT`/`DEV_REDIS_PORT`. |
| El contenedor está healthy pero `localhost:3001` no responde | En modo contenedor, comprueba que se incluyó `compose.dev.yml`. |
| Error de certificado en `https://127.0.0.1:8080` | Es autofirmado: acéptalo en el navegador o usa `--cacert secrets/gateway-tls-cert.pem`. |
| `/api/v1/auth/refresh` da 401 desde Swagger | La cookie solo viaja a `https://…:8080/api/v1/auth/refresh` desde el mismo origen; haz login antes en la misma UI. |
| Puerto 8080 ocupado | Libera el puerto o, en contenedor, define `GATEWAY_PUBLISH=127.0.0.1:<puerto>`. |

## Limpieza

- `Ctrl+C` detiene los dos procesos Node del modo nativo y **conserva** PostgreSQL/Redis en marcha
  con sus volúmenes. Añade `--down-deps` para bajarlos sin borrar datos.
- Para regenerar claves o secretos desde cero, elimina `.env` y `secrets/` y ejecuta
  `npm run env:auth:dev`.
- En modo contenedor, `Ctrl+C` baja el proyecto `stayhub-auth-dev` (contenedores y redes) **sin** `-v`:
  los volúmenes `stayhub-auth-dev_auth-db-data` y `stayhub-auth-dev_users_data` se conservan. Para
  borrar esos datos a propósito: `podman volume rm` (o `docker volume rm`) de esos volúmenes.
- Volúmenes del modo nativo: `stayhub-auth-users-dev_auth-dev-db-data` y
  `stayhub-auth-users-dev_users-dev-db-data`.

## Entorno de desarrollo en contenedores

`npm run dev:swagger:docker` equivale a `--service-container` y compone
`docker-compose.yml` (base) + `infra/docker/auth/compose.dev.yml` (override de desarrollo):

- proyecto Compose `stayhub-auth-dev`, con la configuración persistente `.env` y `secrets/`
  (no se generan claves efímeras);
- levanta `api-gateway` + `gateway-redis`, Auth, **Users real** (sin `users-stub`), sus migraciones
  y PostgreSQL/Redis;
- el Compose base solo publica el Gateway (`${GATEWAY_PUBLISH:-127.0.0.1:8080}:8080`); el override
  añade `127.0.0.1:3001` y `127.0.0.1:3002` para Swagger interno. Redes: `auth-internal`,
  `users-internal`, `gateway-internal` (aisladas), `services` (Gateway↔Auth↔Users) y `edge`;
- las variables `GATEWAY_*` van en un `env_file` temporal (`GATEWAY_ENV_FILE`), no en `.env`;
- antes de `up` hace `down` (sin `-v`) para que los secretos temporales se vuelvan a montar;
- `NODE_ENV=development` en ambos para habilitar Swagger;
- espera `users-service: service_healthy` antes de Auth, y Auth + Users + `gateway-redis` sanos
  antes del Gateway;
- al detener (`Ctrl+C`) baja los contenedores **sin** `-v`: conserva datos y secretos.

Notas de motor:

- El script copia los secretos a un directorio temporal legible (`0444`) antes de componer:
  Compose monta los archivos conservando el `0600` del host y los usuarios no root de los
  contenedores (postgres/node) no podrían leerlos.
- Con SELinux en modo `enforcing` el override aplica `security_opt: ["label=disable"]` a los
  servicios de Users que montan secretos. Docker aplica `0444` y tolera el mismo override.
- Verificado con `podman` + `podman-compose`; también es compatible con Docker.

## Verificación del Gateway (2026-09-30)

Con `podman` + `podman-compose`, en `dev:swagger:docker` y en `dev:swagger` (nativo), por
`https://127.0.0.1:8080`: `/docs` 200 con las 8 rutas; registro 201; login con contraseña errónea
401; login 200 sin refresh en el cuerpo y cookie `HttpOnly; Secure; SameSite=Strict`; validate sin
token 401 y con token 200; refresh 200 con cookie nueva; replay 401 y validate posterior 401; perfil
propio 200, ajeno 403; `X-User-Id` sin token 401; login con Auth detenido 503. `.env` y los secretos
previos quedaron con sha256 idéntico; los volúmenes se conservan tras `Ctrl+C`.

## Verificación registrada Auth↔Users (2026-09-30)

Ambos modos se ejecutaron con `podman` + `podman-compose` y los recorridos de
[agents/integracion/resultado.md](../agents/integracion/resultado.md). En cada modo: readiness 200 y
`/docs` 200 en ambos servicios; registro 201, login 200 y perfil GET 200 / PATCH 200 (`version` 2);
perfil ajeno 403 y service JWT usado como bearer de perfil 401. Tras `Ctrl+C` y un nuevo arranque,
el login del mismo usuario devuelve el mismo `userId` con el perfil persistido, y `.env`/`secrets/`
no cambian (sha256 idéntico). No arrancó ningún `users-stub`. El Compose base no publica puertos; el
override de desarrollo solo publica Auth y Users en `127.0.0.1`.

Las pruebas automáticas equivalentes, sin Gateway, se ejecutan con `npm run test:auth-users`.
