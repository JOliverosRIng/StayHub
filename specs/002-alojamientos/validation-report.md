# Validation report: accommodations-service v1

Evidencia local de implementación de `apps/accommodations-service`. Solo se registran comandos ejecutados
realmente, con su exit code, suites y pruebas. La integración con G1 (Gateway) y G3 (Auth) no se simula.

## Punto de partida (2026-11-04)

- Rama `feat/accommodations-service` en `23ef267` (`docs(accommodations): spec, modelo, contrato OpenAPI y backlog ACC-001..037`), sin cambios locales.
- **El commit `c2571fd` (`feat(accommodations): add isolated service foundation`) no existe**: no aparece por hash ni por mensaje en ninguna rama local o remota tras `git fetch --all --prune`, ni en reflog, stash, worktrees u objetos huérfanos (`git fsck --lost-found`). Tampoco existía `apps/accommodations-service/` ni este informe, y `tasks.md` tenía las 37 tareas sin marcar.
- Por decisión del usuario se integró `main` con un merge no destructivo (`276aefb Merge branch 'main' into feat/accommodations-service`, sin conflictos) y se implementó la Fase 1 desde cero, incluidas ACC-005 y ACC-007.

## Entorno de verificación

- Node `v22.16.0` / npm `10.9.2` en el host (el `engines` del proyecto pide Node 20; npm solo emite `EBADENGINE`). La imagen Docker usa `node:20-bookworm-slim`.
- PostgreSQL de pruebas: contenedor desechable `stayhub-accommodations-test-db` (`postgres:16-alpine`, PostgreSQL 16.15) publicado en `127.0.0.1:55436`, base `accommodations_db`, credenciales sintéticas. El harness crea un esquema aislado por suite, aplica las migraciones reales y lo elimina.
- `ACCOMMODATIONS_TEST_DATABASE_URL=postgresql://accommodations:TEST_ONLY@127.0.0.1:55436/accommodations_db`.
- Dependencias instaladas con `npm install` dentro de `apps/accommodations-service` (lockfile local). No se tocó ningún manifiesto raíz.

## Criterio para marcar tareas

- `[X]` solo si existen todos los entregables de la tarea dentro de las rutas autorizadas, sus dependencias declaradas (`Depends on`) están completas y hay evidencia de ejecución.
- **ACC-001** (congelar campos en spec/data-model/OpenAPI) queda sin marcar porque esos archivos no son editables en esta fase. Las decisiones v1 se tratan como aprobadas por indicación explícita del usuario; por eso ACC-001 no bloquea las tareas locales que dependen de él.
- **ACC-002, ACC-003 y ACC-004** (G1/G3) siguen abiertas. Una tarea con `Depends on` sobre ellas no se marca aunque su implementación local esté completa y probada; se documenta aquí como *implementada localmente, bloqueada*.
- Las anotaciones `External dependency` (sin `Depends on` externo) se registran como integración pendiente y no impiden marcar la parte local.
- ACC-007 depende de ACC-006, que solo puede cerrarse en su parte local. Se marca por indicación explícita del usuario (consideraba ACC-005 y ACC-007 completas); el registro en manifiestos raíz queda pendiente.
- Por la misma razón, cuando una tarea depende de ACC-006 (p. ej. ACC-013 vía ACC-005–ACC-007) se considera satisfecha por su parte local: el usuario exigió que el servicio instale, compile y pruebe de forma autónoma sin registrarse en workspaces. ACC-006 en sí sigue sin marcar.

## Fase 1 — Esqueleto y runtime aislado (2026-11-04)

**Tareas cerradas**: ACC-005, ACC-007.
**Parciales**: ACC-006 (parte local hecha), ACC-008 (entregables locales hechos).

### Prueba primero (ACC-005)

| Comando (desde `apps/accommodations-service`) | Exit | Resultado |
|---|---|---|
| `npx jest --selectProjects unit --runInBand` (antes de implementar) | 1 | 2 suites fallidas, 0 pruebas: `TS2307 Cannot find module '../../src/infrastructure/config/accommodations-config'` (conducta ausente). |

### Verificación tras implementar

| Comando | Exit | Suites | Pruebas |
|---|---|---|---|
| `npx prisma generate --schema prisma/schema.prisma` | 0 | — | — |
| `npx jest --selectProjects unit --runInBand` | 0 | 2 passed | 40 passed |
| `npx jest --selectProjects integration --runInBand` (PostgreSQL 16 real) | 0 | 1 passed | 3 passed |
| `npm run typecheck` | 0 | — | — |
| `npm run lint` | 0 | — | — |
| `npm run build` | 0 | — | — |
| `node dist/main.js` sin configuración | 1 | — | Log `fatal` genérico, sin secretos. |
| `node dist/main.js` con configuración válida + `GET /health/live`, `/health/ready` | — | — | `{"status":"live"}`, `{"status":"ready"}` |

Durante la implementación dos ejecuciones fallaron y se corrigieron sin cambiar fuentes de verdad: un error de tipado en la propia prueba del logger (se usó la interfaz `LoggerService`, como en Users) y el JSON mal formado, que Nest entrega como `BadRequestException`; ahora todo 400 del framework se mapea a `VALIDATION_ERROR` con `errors[].field = body`.

### Entregables

- ACC-005: `test/unit/config.spec.ts`, `test/unit/http-adapters.spec.ts`, `test/integration/health.spec.ts` (+ `test/integration/postgres.setup.ts`, `test/fixtures/config.fixture.ts`).
- ACC-006 (local): `package.json`, `package-lock.json`, `tsconfig.json` (extiende `../../tsconfig.base.json`, alias `@accommodations/*`), `tsconfig.build.json`, `jest.config.ts` (proyectos unit/integration/contract/security, umbral global 70 %), `eslint.config.mjs` local (la configuración raíz no cubre este servicio; mismas reglas que Users y fronteras de capas).
- ACC-007: `src/main.ts`, `src/app.module.ts`, `src/infrastructure/config/` (fail-fast; puerto 3003; base exacta `accommodations_db`; PEM RSA ≥ 2048 **o** JWKS local con el `kid`; `kid`, issuer y audience obligatorios), `src/modules/health/`, Problem Details, trazas `x-trace-id`, logger seguro y exportador OTLP. Sin dependencia de Users DB.
- ACC-008 (local): `infra/docker/accommodations/Dockerfile` (multi-stage, Node 20, usuario `node`, `EXPOSE 3003`, volumen de fotos, target `migration`), `infra/docker/accommodations/.dockerignore` y `Dockerfile.dockerignore` (BuildKit solo lee el ignore junto al Dockerfile con ese nombre), `apps/accommodations-service/README.md`, `apps/accommodations-service/.env.example`.

### Pendientes de la fase

- ACC-006: registrar el workspace y scripts en `package.json`/`package-lock.json` raíz, `nest-cli.json` y alias en `tsconfig.base.json` (archivos compartidos, fuera de alcance).
- ACC-008: servicio, base, red interna y volumen en `docker-compose.yml` (archivo compartido). La imagen no se construyó en esta fase.

## Fase 2 — Dominio, Prisma, migraciones, semilla y repositorio (2026-11-04)

**Tareas cerradas**: ACC-009, ACC-010, ACC-011, ACC-012 (dependen solo de ACC-001, aprobada por el usuario).

### Prueba primero

| Comando (desde `apps/accommodations-service`) | Exit | Resultado |
|---|---|---|
| `npx jest --selectProjects unit --runInBand` (ACC-009, antes de ACC-011) | -1 (fallo reportado por la terminal) | 3 suites nuevas fallidas por `TS2307` sobre `src/domain/...` (conducta ausente). |
| `npx jest --selectProjects integration --runInBand` (ACC-010, antes de ACC-012) | 1 | 3 suites nuevas fallidas por `TS2307` (`prisma/seed`, puerto/repositorio ausentes); `health.spec.ts` pasa. |

### Verificación tras implementar

| Comando | Exit | Suites | Pruebas |
|---|---|---|---|
| `npx prisma generate --schema prisma/schema.prisma` | 0 | — | — |
| `npx jest --selectProjects unit` | 0 | 5 passed | 171 passed |
| `npx jest --selectProjects integration --runInBand` (PostgreSQL 16.15 real, esquema aislado por suite) | 0 | 4 passed | 38 passed |
| `npm run typecheck` | 0 | — | — |
| `npm run lint` | 0 | — | — |
| `npm run build` | 0 | — | — |

La primera ejecución de lint falló (exit 1) por una aserción de tipo innecesaria en `property.repository.spec.ts`; se sustituyó por un type guard sin cambiar la expectativa.

### Entregables

- ACC-009: `test/unit/property-policy.spec.ts`, `room-policy.spec.ts`, `location-validation.spec.ts`.
- ACC-010: `test/integration/migrations-health.spec.ts` (lista exacta de migraciones, readiness 503 sin semilla, CHECKs, `Decimal(12,2)`, unicidad, cascadas), `feature-seed.spec.ts` (idempotencia), `property.repository.spec.ts` (create, findById, reemplazo de rooms, version+1, rollback, feature desconocida, concurrencia con un único `VERSION_CONFLICT`, foto sin incrementar versión) y `test/fixtures/accommodations.fixture.ts`.
- ACC-011: `src/domain/{shared,properties,rooms,features,photos}` sin imports de Nest/Prisma (regla de capas en ESLint local).
- ACC-012: `prisma/schema.prisma`, migraciones `202611040001_create_accommodations` (con CHECKs) y `202611040002_seed_feature_catalog`, `prisma/seed.ts` (upsert idempotente), `src/infrastructure/persistence/prisma/property.repository.ts` (transacciones interactivas con `SELECT ... FOR UPDATE`, decisión dentro del bloqueo, `updateMany` condicionado por `version` como respaldo optimista) y `PROPERTY_REPOSITORY` en `PrismaModule`; readiness exige ambas migraciones.

### Decisiones de implementación

- Las rooms se devuelven ordenadas por `(createdAt, id)`; no se conserva el orden de la solicitud (el contrato no lo exige).
- Catálogo Feature: `WIFI`, `PARKING`, `POOL`, `AIR_CONDITIONING`, `KITCHEN`, `PETS_ALLOWED`, `BREAKFAST_INCLUDED`, cargado por migración versionada y re-aplicable con `npm run prisma:seed`.

## Fase 3 — JWT RS256, roles OWNER y bearer opcional (2026-11-04)

**Tareas cerradas**: ACC-013, ACC-014, ACC-015 (parte local). La confirmación de claims y la forma de entregar la clave pública/JWKS siguen pendientes de G3 (ACC-003); el forwarding del bearer por Gateway sigue pendiente de G1 (ACC-002). Todas las pruebas usan claves RSA sintéticas generadas en memoria.

### Prueba primero

| Comando (desde `apps/accommodations-service`, con `ACCOMMODATIONS_TEST_DATABASE_URL`) | Exit | Resultado |
|---|---|---|
| `npx jest --selectProjects unit security --runInBand test/unit/roles.spec.ts test/security` | 1 | 4 suites fallidas, 11 pruebas fallidas: `TS2307` en `jwt-hardening`, `roles-guard` y `roles` (guards/verifier ausentes); `optional-bearer` ejecuta 11 pruebas y todas fallan porque `GET /properties/{id}` responde 404 de ruta inexistente. |

### Verificación tras implementar

| Comando | Exit | Suites | Pruebas |
|---|---|---|---|
| `npx jest --selectProjects unit security --testPathIgnorePatterns optional-bearer` | 0 | 8 passed | 215 passed |
| `npx jest --selectProjects unit security test/unit/roles.spec.ts test/security/...` (incluye `optional-bearer`) | 1 | 1 failed, 8 passed | 11 failed, 215 passed |
| `npm run typecheck` | 0 | — | — |
| `npm run lint` | 0 | — | — |

`test/security/optional-bearer.spec.ts` (ACC-015) queda **rojo a propósito** en este commit: es la prueba primero de la lectura y pasará a verde cuando ACC-022 (Fase 5) implemente `GET /properties/{id}` y el guard de bearer opcional. La primera ejecución de lint falló por tipos de retorno en la propia prueba; se corrigió sin cambiar expectativas.

### Entregables

- ACC-013: `test/security/jwt-hardening.spec.ts` (32 rechazos: `kid` ausente/incorrecto/no string, `alg` none/HS256 con la clave pública, firma vacía o ajena, `exp`/`iat` ausentes, no enteros, como string, futuros o vencidos, `exp ≤ iat`, issuer/audience ausentes o distintos, `sub` no UUID o no canónico, `role` ausente/desconocido/en minúsculas, esquemas no bearer), `test/security/roles-guard.spec.ts`, `test/unit/roles.spec.ts`, y los fixtures `test/fixtures/auth-app.fixture.ts` y `forgeToken` en `config.fixture.ts`.
- ACC-014: `src/infrastructure/security/jwt.verifier.ts` (RS256 fail-closed: `alg` y `kid` de cabecera, firma, `iss`, `aud`, `iat`/`exp` enteros con `iat ≤ ahora < exp` y `exp > iat`, `sub` UUID, `role` ∈ GUEST/OWNER/ADMIN), `src/interfaces/http/auth/jwt.strategy.ts` (`JwtAuthGuard` sin passport, `bearerToken`, `authenticate`), `principal.decorator.ts`, `src/interfaces/http/guards/roles.guard.ts` (rol no permitido → `FORBIDDEN` 403) y `roles.decorator.ts`; `src/modules/auth/auth.module.ts`. La configuración obligatoria ya existía desde ACC-007.
- ACC-015: `test/security/optional-bearer.spec.ts`.

### Decisiones de implementación

- Sin tolerancia de reloj y sin límite de vida máxima del token: la spec no los fija y G3 aún no confirma los claims temporales.
- No se exigen `sid`/`jti` (la spec solo lista `sub`, `role`, `iss`, `aud`, `kid`, `iat`, `exp`); claims adicionales se ignoran y nunca se exponen.
- Rechazos de autenticación: `401` con `code: HTTP_401`, sin detalle del motivo. Rechazos de rol: `403` con `code: FORBIDDEN`.

## Fase 4 — `POST /properties` (2026-11-04)

**Tareas cerradas**: ACC-017.
**Implementadas localmente, bloqueadas**: ACC-016 (`Depends on: ACC-001–ACC-004`), ACC-018 y ACC-019 (dependen de ACC-016). ACC-019 además lista el contrato OpenAPI como entregable; no se modificó porque la implementación coincide con él y el contrato no es editable sin autorización.

### Prueba primero

| Comando (con `ACCOMMODATIONS_TEST_DATABASE_URL`) | Exit | Resultado |
|---|---|---|
| `npx jest --selectProjects unit contract security integration --runInBand property-create property-authorization` | 1 | 4 suites fallidas; 23 pruebas fallidas, 2 pasadas (las que solo leen el contrato). `TS2307` en la unitaria (DTO/caso de uso ausentes); contrato, seguridad e integración reciben 404 de ruta inexistente. |

### Verificación tras implementar

| Comando | Exit | Suites | Pruebas |
|---|---|---|---|
| `npx jest --selectProjects unit contract security integration --runInBand --testPathPattern "property-create\|property-authorization"` | 0 | 4 passed | 43 passed |
| `npx jest --selectProjects unit` | 0 | 7 passed | 198 passed |
| `npm run typecheck` | 0 | — | — |
| `npm run lint` | 0 | — | — |

Durante la implementación falló el validador de esquemas de prueba (no el servicio): ignoraba `pattern` dentro de un `not` sin `type`, y daba por inválido todo `amount`. Se corrigió aplicando las palabras clave según el tipo real del valor. Un error de lint en la propia prueba también se corrigió sin cambiar expectativas.

### Entregables

- ACC-016: `test/contract/property-create.contract.spec.ts` y el helper `test/contract/openapi-contract.ts`, que lee el YAML de `specs/002-alojamientos/contracts/` y valida status documentado, `Content-Type` y cuerpo (`type`, `required`, `additionalProperties`, `enum`, `pattern`, `not`, `allOf`, `nullable`, longitudes, rangos, `uniqueItems`, `format uuid/date-time`).
- ACC-017: `test/unit/property-create.spec.ts`, `test/security/property-authorization.spec.ts` (401 antes de validar, 403 antes de validar, `ownerId` suplantado → 400 sin persistir), `test/integration/property-create.spec.ts` (agregado completo, `featureCodes` desconocido → 400 con rollback total, sin internos de almacenamiento).
- ACC-018: `src/interfaces/http/properties/create-property.dto.ts` (cuerpo cerrado), `src/application/properties/create-property.use-case.ts` (ids y `ownerId` del servidor), `property.presenter.ts` (`ownerId` solo al dueño; fotos sin `storageKey`), `properties.controller.ts` con `operationId: createProperty`, y `src/modules/properties/properties.module.ts`.

### Decisiones de implementación

- Claves desconocidas en la raíz del cuerpo (incluidas `ownerId`, `status`, `version`, `id`) devuelven `VALIDATION_ERROR` con `errors[].field = body`.
- `basePrice.amount` se devuelve normalizado a dos decimales (`"120000.5"` → `"120000.50"`), coherente con `Decimal(12,2)` y con el patrón del contrato.
- Los campos opcionales de `Location` no enviados se omiten en la respuesta (no se devuelven como `null`, porque el esquema no los declara `nullable`).
- Cualquier rechazo del parser JSON (sintaxis, tamaño, charset) se mapea a `400 VALIDATION_ERROR` en `body`: `POST`/`PUT` no documentan 413/415. El JSON mal formado se rechaza antes de autenticar, porque el parser corre como middleware antes de los guards.

## Fase 5 — `GET /properties/{id}` (2026-11-04)

**Tareas cerradas**: ninguna.
**Implementadas localmente, bloqueadas**: ACC-020 (`Depends on: ACC-002–ACC-003`), ACC-021 (depende de ACC-020), ACC-022 y ACC-023 (dependen de ACC-020–ACC-021). ACC-023 no modifica el contrato (la implementación coincide con él) ni código de Gateway.

### Prueba primero

| Comando (con `ACCOMMODATIONS_TEST_DATABASE_URL`) | Exit | Resultado |
|---|---|---|
| `npx jest --selectProjects unit contract security integration --runInBand --testPathPattern "property-read\|property-visibility\|optional-bearer"` | 1 | 5 suites fallidas; 24 pruebas fallidas, 2 pasadas (lectura del contrato y una igualdad de 404 que también se cumple con la ruta inexistente). `TS2307` en la unitaria (caso de uso ausente); el resto recibe 404 de ruta inexistente. |

### Verificación tras implementar

| Comando | Exit | Suites | Pruebas |
|---|---|---|---|
| mismo comando | 0 | 5 passed | 44 passed |
| `npm run typecheck` | 0 | — | — |
| `npm run lint` | 0 | — | — |

`test/security/optional-bearer.spec.ts` (ACC-015), rojo desde la Fase 3, pasa ahora a verde.

### Entregables

- ACC-020: `test/contract/property-read.contract.spec.ts` (seguridad `bearerAuth` o `{}`, PUBLISHED anónimo sin `ownerId` ni internos de foto, DRAFT/UNPUBLISHED al dueño, 404 idéntico para oculta e inexistente, 400 en `id`, 401 con bearer inválido).
- ACC-021: `test/unit/property-visibility.spec.ts`, `test/security/property-read-authorization.spec.ts`, `test/integration/property-read.spec.ts`.
- ACC-022: `src/application/properties/get-property.use-case.ts`, `src/interfaces/http/auth/optional-jwt.guard.ts`, `GET /properties/{id}` en `properties.controller.ts` (`operationId: getProperty`). La proyección agregada ya estaba en `property.repository.ts` (Fase 2).

### Decisiones de implementación

- La autenticación opcional corre antes de validar el `id`: un bearer inválido con un `id` mal formado devuelve 401.
- El `id` de la ruta se acepta sin distinguir mayúsculas y se normaliza a minúsculas; `ADMIN` y `GUEST` no ven `ownerId` aunque su `sub` coincida con el dueño.

## Fase 6 — `PUT /properties/{id}` reemplazo y publicación (2026-11-04)

**Tareas cerradas**: ninguna.
**Implementadas localmente, bloqueadas**: ACC-024 (`Depends on: ACC-001–ACC-004`), ACC-025 (depende de ACC-024), ACC-026 (depende de ACC-024), ACC-027 y ACC-028 (dependen de ACC-024–ACC-026). ACC-028 no modifica el contrato.

### Prueba primero

| Comando (con `ACCOMMODATIONS_TEST_DATABASE_URL`) | Exit | Resultado |
|---|---|---|
| `npx jest --selectProjects unit contract security integration --runInBand --testPathPattern "property-replace\|property-ownership\|publication-policy\|property-publication"` | 1 | 6 suites fallidas; 17 pruebas fallidas, 3 pasadas (lectura del contrato). `TS2307` en unitarias (DTO/caso de uso ausentes); HTTP recibe 404 de ruta inexistente. |

### Verificación tras implementar

| Comando | Exit | Suites | Pruebas |
|---|---|---|---|
| mismo comando | 0 | 6 passed | 38 passed |
| `npm run typecheck` | 0 | — | — |
| `npm run lint` | 0 | — | — |

### Entregables

- ACC-024: `test/contract/property-replace.contract.spec.ts`.
- ACC-025: `test/unit/property-replace.spec.ts`, `test/security/property-ownership.spec.ts`, `test/integration/property-replace.spec.ts`.
- ACC-026: `test/unit/publication-policy.spec.ts`, `test/integration/property-publication.spec.ts`, `test/fixtures/property-publication.fixture.ts` (inserta PNG en disco y metadata, sin `POST /photos`).
- ACC-027: `src/application/properties/replace-property.use-case.ts` (`planReplacement`), `src/interfaces/http/properties/replace-property.dto.ts`, `PUT /properties/{id}` (`operationId: replaceProperty`). `publication.policy.ts` ya existía desde ACC-011.

### Decisiones de implementación

- Orden de comprobación dentro del bloqueo: 404 de ownership → `VERSION_CONFLICT` → `rooms[i].id` desconocido/ajeno → `STATE_CONFLICT` → `PUBLICATION_INCOMPLETE`. Un extraño con versión o rooms inválidos sigue recibiendo 404.
- `PUBLICATION_INCOMPLETE` solo se evalúa cuando el estado resultante es `PUBLISHED` (incluye republicar desde `UNPUBLISHED`); editar un `DRAFT` incompleto está permitido.
- La foto de las pruebas de publicación se inserta por fixture, no por el endpoint de la Fase 7.
