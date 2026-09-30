# PRE-003 — Resultado de ejecución

Fecha: 2026-09-28. Base: commit `393a80d`. Estado: **Verificado localmente** contra PostgreSQL 16 y Redis 7 reales (Podman; Docker no está instalado).

Dependencias PRE-001 y PRE-002: ejecutadas.

## Cambios realizados

| Archivo | Cambio |
|---|---|
| `apps/auth-service/prisma/schema.prisma` | Enum `SessionRevokeReason` (`REFRESH_REUSE`, `EXPIRED`, `SECURITY`, `USER_INACTIVE`) y `Session.revokeReason` nullable. |
| `apps/auth-service/prisma/migrations/004_session_revocation/migration.sql` | **Nuevo.** Crea el enum, añade `revokeReason`, backfill `SECURITY` para filas con `revokedAt` y CHECK de coherencia `revokedAt`/`revokeReason`. |
| `apps/auth-service/src/domain/sessions/session.ts` | `SessionProperties.revokeReason`; `revoke(now, reason = 'SECURITY')` idempotente que conserva el motivo original; `snapshot`/`rehydrate` incluyen el campo. |
| `apps/auth-service/src/application/ports/session-unit-of-work.port.ts` | **Nuevo.** `SessionUnitOfWork.execute(work)` con contexto de repositorios ligados al cliente tx y `lockSession`/`lockRefresh`/`markConsumed`/`insertSuccessor`/`linkSuccessor`/`revokeActiveForSession`/`saveSession`/find. Sin tipos Prisma en el puerto. |
| `apps/auth-service/src/application/ports/repositories.port.ts` | `SessionRepository.revoke` recibe `reason: SessionRevokeReason`. |
| `apps/auth-service/src/infrastructure/persistence/prisma/session.repository.ts` | `revokeReason` en persistencia y dominio; helpers exportados `createSessionRepository(client)`/`persistSession`/`toSessionDomain`; `revoke` persiste el motivo. |
| `apps/auth-service/src/infrastructure/persistence/prisma/refresh-token.repository.ts` | Helpers exportados `createRefreshTokenRepository(client)`/`persistRefreshToken`/`toRefreshTokenDomain`. |
| `apps/auth-service/src/infrastructure/persistence/prisma/session-unit-of-work.ts` | **Nuevo.** `PrismaSessionUnitOfWork`: contexto sobre `Prisma.TransactionClient`, locks `FOR UPDATE` (sesión antes que token), rotación por pasos y reintentos máximos 3 para errores de concurrencia. |
| `apps/auth-service/src/application/ports/index.ts` | Exporta `session-unit-of-work.port`. |
| `apps/auth-service/src/infrastructure/persistence/prisma/prisma.service.ts` | Readiness exige también `004_session_revocation`. |
| `apps/auth-service/test/integration/session-unit-of-work.spec.ts` | **Nuevo.** 6 pruebas con dos conexiones Prisma. |

`PrismaSessionUnitOfWork` **no** se registra en `AppModule`: AUTH-072 lo conectará al componer Sessions/Login/Tokens. Las pruebas lo instancian directamente (paso 6).

## Comportamiento verificado

- `execute(work)`: abre una única transacción; todos los accesos usan el cliente transaccional (sin writes del cliente raíz). Devuelve el resultado del callback (commit) o revierte si el callback lanza.
- `lockSession`/`lockRefresh`: `SELECT ... FOR UPDATE`; el orden es sesión y después token.
- `markConsumed(id, now)` → `insertSuccessor(token)` → `linkSuccessor(prev, successor)`: mantiene el índice parcial `RefreshToken_one_active_per_session` y la FK inmediata de `replacedByTokenId`.
- `revokeActiveForSession` revoca todos los ACTIVE de la sesión y devuelve el número.
- Reintentos: máximo 3 (`MAX_TRANSACTION_ATTEMPTS`) solo para `P2034` de Prisma y códigos PostgreSQL `40001` (serialization_failure) / `40P01` (deadlock_detected); un error de negocio no se reintenta.

## Evidencia

```sh
npm run prisma:generate   # OK
npm run typecheck         # OK
npm run lint              # OK
npm run test:unit         # OK — 6 suites, 25 tests
npm run build             # OK — dist/apps/auth-service/main.js

TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- \
  --selectProjects integration --runTestsByPath test/integration/session-unit-of-work.spec.ts
# OK — 6 tests
```

Migración desde cero: `prisma migrate deploy` aplicó `001`→`002`→`003`→`004`. Las suites de integración completas pasan (2 suites, 16 tests).

Pruebas (6/6):
1. rollback de todas las tablas implicadas ante fallo del callback;
2. `revokeReason` persistido, versión incrementada, rol y `absoluteExpiresAt` inmutables;
3. orden consume → insert successor → link con relectura externa por hash y bajo lock;
4. como máximo un token ACTIVE por sesión (el segundo insert falla);
5. un callback que devuelve `replay` confirma la revocación (commit) en lugar de revertir;
6. los locks de sesión se serializan entre dos conexiones.

## Criterios de aceptación

- [x] No hay writes del cliente raíz dentro de `execute`; el rollback revierte todas las tablas implicadas.
- [x] Un callback que devuelve replay permite commit; un error técnico revierte la transacción.
- [x] La sesión serializada incluye `revokeReason` y mantiene rol/`absoluteExpiresAt` inmutables.

## Bloqueos / limitaciones

- Docker no está instalado; verificación con Podman y el mismo `compose.test.yml`. No se construyó la imagen.
- Node 22 en lugar de 20 (misma limitación previa); sin fallos.
- El código de concurrencia se documenta por lectura de Prisma/PostgreSQL; no se forzó un deadlock real en las pruebas.

## Notas para AUTH-062/AUTH-067/AUTH-072 (fuera de alcance)

- No se implementa la rotación de negocio ni la emisión final de tokens. Esta unidad provee locks, orden de escritura, revocación y reintentos.
- El resultado `replay` debe devolverse como valor desde `execute` y el error HTTP 401 se lanza **después** del commit.
