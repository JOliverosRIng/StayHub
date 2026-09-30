# AUTH-031 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN con coordinador de referencia)**.

Dependencias: PRE-002 y PRE-004 (verificadas localmente). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Preparar la suite de recuperación de la saga de registro (`Auth ↔ Users`) sobre PostgreSQL real y Users
stub HTTP, cubriendo caída/recuperación en cada frontera durable y reconciliación de timeouts.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/integration/registration-saga.spec.ts` | **Nuevo**. 11 pruebas de saga con `ReferenceRegistrationCoordinator` (fixture test-local que implementa D03 sobre puertos reales), `StubUsersAdapter` (HTTP contra `UsersStub`) e inyección de fallos por frontera. | No existe aún `RegisterAccountUseCase` (AUTH-040); el fixture mantiene el puerto `RegisterAccountUseCase` y se sustituye por el real en AUTH-042/AUTH-048. |
| `apps/auth-service/src/infrastructure/persistence/prisma/registration.repository.ts` | **Corrección.** `claimBatch` pasa a `UPDATE ... FROM (WITH selected AS (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED))`. | La suite de concurrencia destapó que el patrón `WHERE id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED)` **no acota** el UPDATE bajo contención (EPQ puede re-evaluar el subplan y actualizar más de `n` filas). Ver “Defecto encontrado” abajo. |

`test/helpers/users-stub.ts` no requirió cambios: ya implementa el contrato candidato (create/get/activate/
cancel/resolve) con fallos `before`/`after` y captura de requests.

## Cobertura de la suite (11/11 GREEN)

- **Happy path:** User `ACTIVE`, Credential `ACTIVE` (hash exacto) y Registration `COMPLETED`; respuesta
  pública solo `id/name/email/role`; el log del stub no contiene la contraseña.
- **Reinicio en cada frontera durable** (`afterCreateUser`, `afterPersistCredential`,
  `afterActivateCredential`, `afterActivateUser`): se reconstruye el coordinador y se reintenta la misma
  key; una identidad, una credencial y `COMPLETED`.
- **Users caído antes de create:** 503, estado local `STARTED` preservado y recuperación en el reintento.
- **Timeout después de create:** el User quedó `PENDING`; el reintento reconcilia idempotentemente.
- **Timeout después de activate:** el User quedó `ACTIVE`; el reintento completa consultando el estado real
  y **no** cancela.
- **`IdempotencyConflictError`:** misma key con fingerprint distinto; sin llamadas nuevas a Users.
- **`RegistrationConflictError`:** segunda key con correo equivalente (case-insensitive).
- **Login parcial:** con la saga incompleta `resolveLoginIdentity` devuelve `null`; al completar, `ACTIVE`.

## Defecto encontrado y corregido (`claimBatch`)

Las ejecuciones repetidas del test de lotes concurrentes (AUTH-030) fallaban de forma intermitente con
`A=6, B=0` (un worker reclamaba las 6 filas y el otro 0), violando el `LIMIT 3`. Causa: el patrón
`UPDATE ... WHERE id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED)` puede re-evaluar el subplan y no acotar
el conjunto actualizado bajo concurrencia. Sustituido por el patrón canónico
`WITH selected AS (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED) UPDATE ... FROM selected`.

Validación: 12/12 ejecuciones deterministas de la suite de concurrencia y 5/5 del proyecto de integración
completo tras la corrección.

## Evidencia de comandos

Con PostgreSQL 16 + Redis 7 de `compose.test.yml` (Podman):

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 6 suites, 25 tests
npm run build --workspace @stayhub/auth-service       # OK

TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration
# OK — 4 suites, 34 tests (saga 11/11)
```

## Criterios de aceptación

- [x] Cada frontera durable tiene escenario de caída y recuperación.
- [x] Una repetición produce una sola identidad/credencial.
- [x] Users `ACTIVE` por timeout no se cancela por error (se completa).
- [x] Assertions contra PostgreSQL real y Users stub HTTP; sin simular locks.

## Pendiente / handoff

- **AUTH-040:** implementar `RegisterAccountUseCase`/`advance-registration.service` reales.
- **AUTH-041:** adapter Users real; el `StubUsersAdapter` del spec se reemplaza por el adapter productivo.
- **AUTH-042/AUTH-048:** reemplazar `ReferenceRegistrationCoordinator` por el caso de uso real y re-ejecutar
  esta suite (el coordinador de referencia debe eliminarse entonces).
- La excepción `IdempotencyConflictError` aquí se valida contra el fixture; AUTH-042 la confirmará en el
  caso de uso productivo.
- Sin bloqueos de infraestructura: PostgreSQL/Redis responden con `compose.test.yml`.
