# Probar auth-service con Swagger

Guía rápida y autosuficiente para levantar Auth y probar su API interna desde Swagger UI, sin Gateway
ni servicio Users reales. Todo lo gestiona `scripts/dev-auth-swagger.mjs`.

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
- **`npm run dev:swagger`** asume que las dependencias ya están instaladas. No instala nada; hace:
  1. reutiliza/levanta PostgreSQL y Redis,
  2. `prisma:generate`,
  3. `build` solo si falta `dist/apps/auth-service/main.js` (o con `--build`),
  4. aplica migraciones,
  5. arranca el stub en memoria de Users,
  6. arranca Auth en `development` e imprime la URL de Swagger y el service JWT.

```sh
npm ci                      # una sola vez (o al cambiar dependencias)
npm run dev:swagger         # Auth nativo; solo DB/Redis en contenedor
npm run dev:swagger:docker  # Auth + migrate + DB/Redis + stub de Users en contenedores
```

Flags útiles:

| Flag | Efecto |
|---|---|
| `--port <n>` | Puerto HTTP de Auth (por defecto 3001). |
| `--users-port <n>` | Puerto del stub de Users nativo (por defecto 4010). |
| `--service-container` | Equivale a `dev:swagger:docker`. |
| `--skip-deps` | No levanta DB/Redis; usa `DEV_AUTH_DATABASE_URL` / `DEV_AUTH_REDIS_URL`. |
| `--down-deps` | Baja DB/Redis al salir (modo nativo). |
| `--build` | Fuerza la compilación de Auth. |

## Por qué el script genera un JWT al arrancar

Las cuatro rutas internas de Auth **no son públicas**. Todas exigen
`Authorization: Bearer <service JWT>`:

- `POST /internal/v1/registrations`
- `POST /internal/v1/login`
- `POST /internal/v1/sessions/refresh`
- `POST /internal/v1/sessions/validate`

En producción esas llamadas las hace el **Gateway (G1)**, no un usuario final, presentando un
*service JWT*. El `ServiceAuthGuard` y `ServiceJwtVerifier` verifican
(`apps/auth-service/src/infrastructure/security/service-jwt.verifier.ts`):

- `alg = RS256` y un `kid` presente en `AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON`,
- `issuer` y `audience` configurados,
- `iat`/`exp` vigentes,
- que el `scope` incluya `auth:invoke`.

Como no hay Gateway levantado, el script lo **simula**:

1. Genera un par RSA **efímero** (inbound).
2. Publica la clave pública en `AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON` con `kid = dev-inbound`.
3. Firma un token con `sub = local-dev-gateway`, `iss = stayhub-dev-gateway`,
   `aud = stayhub-auth-service-dev`, `scope = auth:invoke`.
4. Lo imprime al final para que lo pegues en **Authorize**.

Consecuencias:

- Ese JWT es el que autoriza tus pruebas; sin él, las rutas internas responden **401**.
- Las claves son efímeras: el token dura ~1 hora y **cambia en cada arranque**. Si reinicias el
  script, el token anterior deja de valer; copia el nuevo.

## URLs

| Recurso | URL |
|---|---|
| Swagger UI | `http://localhost:3001/docs` (**no** `/api`) |
| OpenAPI JSON | `http://localhost:3001/docs-json` |
| OpenAPI YAML | `http://localhost:3001/docs-yaml` |
| Health | `http://localhost:3001/health/live`, `/health/ready` |

El servidor que usa "Try it out" se toma de **`AUTH_SWAGGER_SERVER_URL`** (solo en `development`).
Por defecto es `/` (relativo al origen), así que funciona igual abriendo `localhost` o `127.0.0.1`
y **sin CORS**. Si necesitas un host concreto:
`AUTH_SWAGGER_SERVER_URL=https://auth.example.test`.

## Flujo de prueba (campos exactos)

1. **Authorize** (arriba a la derecha): pega el service JWT, sin la palabra `Bearer`.

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
   - `validate` busca la sesión por `sessionId` y exige que su `userId` coincida; si los cambias,
     devuelve `401 SESSION_INVALID`.

Mapeo mental:

- `principal.sessionId` → campo `sessionId` de `validate`.
- `principal.userId` → campo `userId` de `validate`.
- `refreshToken` → campo `refreshToken` de `refresh`.
- `accessToken` **no** se envía a ninguna de estas rutas internas.

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `/api` o `/` dan 404 | Swagger está en `/docs`. |
| `TypeError: NetworkError ...` al ejecutar | Abre por `127.0.0.1` o ajusta `AUTH_SWAGGER_SERVER_URL`. |
| 401 en rutas internas | Falta el service JWT o expiró: vuelve a copiarlo del script. |
| 401 en `validate` | `sessionId`/`userId` invertidos, sesión revocada (replay) o reiniciaste el stack. |
| 503 | DB, Redis o el stub de Users no están arriba. |
| Los usuarios "desaparecen" | El stub de Users es **en memoria**: se pierden al reiniciar. |

## Limpieza

- `Ctrl+C` detiene todo. En modo contenedor baja y limpia el proyecto `stayhub-auth-dev`
  (contenedores, red, volumen e imágenes de prueba).
- En modo nativo, añade `--down-deps` si también quieres bajar PostgreSQL/Redis.

## Entorno de desarrollo en contenedores

El modo `--service-container` compone:

- `docker-compose.yml` (base) + `infra/docker/auth/compose.dev.yml` (override de desarrollo),
- proyecto Compose `stayhub-auth-dev`,
- publica `127.0.0.1:${AUTH_DEV_PORT:-3001}:3001`,
- `NODE_ENV=development` y un env temporal con claves/secretos efímeros,
- servicio `users-stub` construido desde `infra/docker/auth/Dockerfile.users-stub`.

Equivalente manual (necesita un env con claves y secretos válidos):

```sh
podman-compose -f docker-compose.yml -f infra/docker/auth/compose.dev.yml -p stayhub-auth-dev up -d --build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/docs   # 200
```
