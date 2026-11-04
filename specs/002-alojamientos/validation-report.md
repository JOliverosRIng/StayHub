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
