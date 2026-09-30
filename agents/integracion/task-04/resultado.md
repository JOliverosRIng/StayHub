# Task 04 — Arranque integrado en contenedores — Resultado

Estado: COMPLETA

Fecha: 2026-09-30
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones usadas: Node `v22.22.2`, npm `10.9.7` (host). Engine de contenedores:
**`podman` + `podman-compose`** (no había `docker`). Prisma Client `6.19.0`.
No se imprimieron secretos ni tokens en este informe.

## 1. Dependencias leídas y estado comprobado

- `agents/integracion/CONTEXTO.md`, el índice `PLAN.md` y `task-04/PLAN.md`.
- **Dependencia task-03**: leído `task-03/resultado.md`; `Estado: COMPLETA` y fila 03 en COMPLETA.
  Se reutiliza la configuración persistente `.env`/`secrets/` y `scripts/lib/dev-env.mjs`.
- Estado real: `compose.dev.yml` añadía `users-stub`; `runContainer` generaba un env temporal
  con claves RSA efímeras y usaba `down -v`. El Compose base ya definía `users-db`, `users-migrate`
  y `users-service` reales.

## 2. Archivos cambiados y decisiones

1. `infra/docker/auth/compose.dev.yml` — elimina `users-stub`; publica Auth y Users solo en
   `127.0.0.1` (`AUTH_DEV_PORT`/`USERS_DEV_PORT`); añade `users-service: service_healthy` como
   dependencia de `auth-service`; pone `NODE_ENV=development` y `USERS_SWAGGER_SERVER_URL` en
   Users; añade `security_opt: ["label=disable"]` a `users-db`, `users-migrate` y `users-service`.
2. `docker-compose.yml` — healthcheck explícito en `users-service` (mismo comando que el
   Dockerfile). Necesario porque podman ignora el `HEALTHCHECK` del Dockerfile por formato OCI
   y `service_healthy` no se cumpliría. El Compose base sigue sin publicar puertos.
3. `infra/docker/users/Dockerfile` — corregida tras fallo **demostrado** de runtime:
   - la etapa `production-dependencies` (`npm prune --omit=dev`) eliminaba `@nestjs/swagger`; el
     runtime ahora copia `node_modules` del `build` (igual que Auth);
   - se copia también `apps/auth-service/package.json` para que `npm ci` reproduzca el árbol real
     del lockfile de workspaces (sin él, `@nestjs/swagger@7.4.2` queda anidado en el workspace y
     no es resoluble desde `dist`).
4. `scripts/dev-auth-swagger.mjs` — `runContainer` reescrito:
   - usa `ensureDevEnvironment` (config persistente, sin claves efímeras) y `AUTH_ENV_FILE=.env`;
   - `stageReadableSecrets`: copia los secretos a un temporal `0755/0444` y sobreescribe las rutas
     `${USERS_*_FILE}` para que los contenedores no root puedan leerlos (podman conserva el `0600`
     del host y el label SELinux);
   - espera readiness de Users y Auth; imprime la ayuda de Swagger de task-03 (dos tokens y dos
     URLs) mediante `printReady`;
   - al salir hace `down --remove-orphans` **sin** `-v` y limpia el temporal: conserva volúmenes;
   - se eliminó el código muerto del stub (`buildConfig`, `serializeEnvFile`, par RSA efímero,
     `startUsersStub`). `--users-port` sigue fallando con mensaje explicativo.
5. `docs/dev-swagger.md`, `apps/auth-service/README.md` y `apps/users-service/README.md` — modo
   contenedor documentado con Users real, loopback y notas de motor (podman/secretos/SELinux).

## 3. Contrato de arranque en contenedores

```text
Proyecto Compose : stayhub-auth-dev
Archivos         : docker-compose.yml + infra/docker/auth/compose.dev.yml
Auth             : 127.0.0.1:3001 -> 3001 (NODE_ENV=development)
Users            : 127.0.0.1:3002 -> 3002 (NODE_ENV=development, Swagger server 127.0.0.1:3002)
Dependencias     : auth-db/auth-redis/users-db (sin puertos publicados)
Migraciones      : auth-migrate y users-migrate previos (service_completed_successfully)
Orden            : auth-service depende de auth-db, auth-redis, auth-migrate y users-service healthy
Stub             : ninguno
Parada           : down sin -v (volúmenes auth-db-data y users_data conservados)
```

## 4. Comandos, códigos de salida y resultados reales

Build y arranque (`node scripts/dev-auth-swagger.mjs --service-container`, en segundo plano):

```text
[dev-auth] modo=container engine=podman auth=3001 users=3002
auth-db healthy / auth-redis healthy / users-db healthy
auth-migrate exit 0 ; users-migrate exit 0
users-service healthy ; auth-service healthy
users /health/ready -> 200 ; auth /health/ready -> 200
auth /docs -> 200 ; users /docs -> 200
users /docs-json servers -> [{"url":"http://127.0.0.1:3002"}]
sin contenedor users-stub
```

Recorrido real en contenedores (curl, identidades `example.test`):

| Paso | Resultado |
|---|---|
| `POST /internal/v1/registrations` (Auth 3001, Idempotency-Key UUID) | `201` |
| `POST /internal/v1/login` | `200`, `principal.userId` + `accessToken` |
| `GET /internal/v1/users/{id}/profile` (Users 3002, bearer accessToken) | `200` |
| `PATCH .../profile` multipart `{"phone":"+3491111111","expectedVersion":1}` | `200`, `version:2` |

Reinicio (parada con `Ctrl+C`, relanzado):

```text
tras Ctrl+C: contenedores retirados, volúmenes stayhub-auth-dev_auth-db-data y _users_data conservados
sha256 de .env y secrets/* idénticos -> sin rotación de secretos
login del mismo correo -> 200, mismo userId
GET perfil -> 200 con phone "+3491111111" y version 2
```

Validaciones:

```sh
npm run typecheck:auth      # exit 0
npm run lint:auth           # exit 0
npm run typecheck:users     # exit 0
npm run lint:users          # exit 0
npm run openapi:auth:check  # 11 tests, 0 fallos
node scripts/validate-users-openapi.mjs   # sin drift
npm run test:auth:unit      # 146 tests, 0 fallos
npm run test:auth:security  # 66 tests, 0 fallos
npm run test:users:unit     # 82 tests, 0 fallos
npm run test:users:security # 35 tests, 0 fallos
podman-compose -f docker-compose.yml config           # exit 0
podman-compose -f docker-compose.yml -f infra/docker/auth/compose.dev.yml config   # exit 0
```

Incidencias reales encontradas y resueltas durante la verificación:

- `auth-migrate` P1000 por un volumen `auth-db-data` antiguo con otra contraseña: se retiró el
  volumen stale del proyecto de desarrollo y se recreó con la contraseña persistente de `.env`.
- `postgres`/`node` no podían leer `/run/secrets/*`: modo `0600` del host + SELinux `enforcing`;
  se resolvió con copias temporales `0444` y `security_opt: ["label=disable"]`.
- `users-service` no arrancaba por `Cannot find module '@nestjs/swagger'`: Dockerfile corregido
  (ver §2.3).
- podman ignoraba el `HEALTHCHECK` OCI de la imagen de Users: healthcheck añadido al compose.

## 5. Escenarios acreditados y pendientes

Acreditados:

- Ambas imágenes construidas con el lockfile y los workspaces actuales.
- Migraciones y healthchecks correctos; Auth espera Users sano.
- Registro→login→perfil reales dentro de contenedores, con PATCH y `expectedVersion`.
- Loopback exclusivo en el override de desarrollo; el Compose base no publica puertos.
- `dev:swagger:docker` no arranca ningún `users-stub`; conserva datos y secretos al reiniciar.

Pendientes / fuera de alcance (no bloquean task-04):

- Harness de integración automatizado sin Gateway y suites cross-service: task-05/task-06.
- La verificación se hizo con `podman`; no se ejecutó `docker` en este host. Los cambios son
  compatibles con Docker (aplica `0444` a los secretos y tolera `label=disable`).

## 6. Recursos temporales creados y limpieza

- Directorios temporales `stayhub-dev-secrets-*` creados y eliminados en cada parada.
- Contenedores del proyecto `stayhub-auth-dev` creados y retirados con `down` (sin `-v`).
- Volúmenes `stayhub-auth-dev_auth-db-data` y `stayhub-auth-dev_users_data` conservados.
- Se creó un tag local `postgres:16-bookworm` a partir de `postgres:16` (ya en caché) para poder
  construir sin red; no se modificó ninguna versión del repositorio y se conserva como caché local.
- Usuarios sintéticos `example.test` de desarrollo en esas bases; no se tocaron bases de pruebas
  (55432/56379) ni datos del usuario. No se eliminaron dobles de pruebas.

## 7. Instrucciones para task-05 (no ejecutada)

- Partir de los servicios reales; el comando se documentará como `npm run test:auth-users`.
- Aislamiento: PostgreSQL 16 desechable y Redis DB 15; no reutilizar `stayhub-auth-dev` ni los
  volúmenes de desarrollo, ni las bases de pruebas 55432/56379.
- Preferir procesos/contenedores separados para Auth y Users (colisión de aliases Prisma/Passport).
- No exigir `CROSS_SERVICE_GATEWAY_URL`; Gateway queda fuera de alcance.
- El smoke debe comprobar readiness de ambos, un registro por Auth y login del usuario.
