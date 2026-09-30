# Registro de ejecución (agents/result)

Este directorio es la **memoria de contexto** de la ejecución de los planes de `agents/`. Se
actualiza al terminar cada plan. Un modelo nuevo debe leer este archivo primero.

Resultados consolidados por bloque:

- [Integración Auth↔Users sin Gateway (task-01…08)](../integracion/resultado.md). Verificado el
  2026-09-30: GET de registro en Users, JWT alineados, `dev:swagger` y `dev:swagger:docker` con
  Users real, y `npm run test:auth-users` con INT-01–17 en verde. No acredita Gateway, HTTPS de
  borde, revisión humana G1/G2 ni CI remota.
- [Bloque 4 — Contratos, integración y cierre (AUTH-075…084)](bloque-4.md)
- [Bloque 3 — Login, tokens y sesiones (AUTH-049…074)](bloque-3.md)
- [Bloque 2 — Registro (AUTH-026…048)](../AUTH-048/resultado.md)

## Cómo continuar en una sesión nueva

1. Leer este `README.md` (estado actual y hallazgos).
2. Leer `agents/README.md` (orden y dependencias) y `agents/decisiones.md` (reglas D01–D10).
3. Leer el `plan.md` del siguiente ID y el `resultado.md` de sus dependencias ya ejecutadas.
4. Ejecutar **un plan por conversación**, en el orden de `agents/README.md`.
5. Al terminar: crear/actualizar `agents/<ID>/resultado.md` y **añadir la fila al progreso de aquí**.

Prompt sugerido (cambiar el ID):

> Ejecuta agents/<ID>/plan.md. Lee los apartados de agents/decisiones.md que indica y el
> resultado de sus dependencias. Reutiliza el código existente. Limita cambios a su alcance.
> Ejecuta las comprobaciones indicadas y registra evidencia en agents/<ID>/resultado.md.
> Si falta infraestructura o un proveedor externo, deja el trabajo independiente listo y
> describe el bloqueo concreto. No marques comportamiento como completo por existir un archivo.

## Snapshot

- Fecha: 2026-09-28.
- Base revisada: commit `393a80d` (rama `Auth_Service`). Todo el trabajo vive sin commitear en el
  árbol de trabajo.
- Planes totales: 47 (4 PRE + 43 AUTH).

## Progreso

| ID | Bloque | Estado | Evidencia |
|---|---|---|---|
| PRE-001 | Preparación | **Verificado local** | [resultado](../PRE-001/resultado.md) |
| PRE-004 | Preparación | **Verificado local** (aprobación G2/G1 pendiente) | [resultado](../PRE-004/resultado.md) |
| PRE-002 | Preparación | **Verificado local** | [resultado](../PRE-002/resultado.md) |
| PRE-003 | Preparación | **Verificado local** | [resultado](../PRE-003/resultado.md) |
| AUTH-026 | Registro | **Verificado local (GREEN)** | [resultado](../AUTH-026/resultado.md) |
| AUTH-030 | Registro | **Verificado local (GREEN)** | [resultado](../AUTH-030/resultado.md) |
| AUTH-031 | Registro | **Verificado local (GREEN)** | [resultado](../AUTH-031/resultado.md) |
| AUTH-032 | Registro | **Verificado local (GREEN)** | [resultado](../AUTH-032/resultado.md) |
| AUTH-033 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-033/resultado.md) |
| AUTH-041 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-041/resultado.md) |
| AUTH-040 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-040/resultado.md) |
| AUTH-042 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-042/resultado.md) |
| AUTH-043 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-043/resultado.md) |
| AUTH-045 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-045/resultado.md) |
| AUTH-046 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-046/resultado.md) |
| AUTH-047 | Registro | **Implementado local (GREEN)** | [resultado](../AUTH-047/resultado.md) |
| AUTH-048 | Registro | **Verificado local (cierre US1)** | [resultado](../AUTH-048/resultado.md) |
| AUTH-049 | Login/tokens/sesiones | **Prueba preparada (RED)** | [resultado](../AUTH-049/resultado.md) |
| AUTH-050 | Login/tokens/sesiones | **Prueba preparada (GREEN fixture)** | [resultado](../AUTH-050/resultado.md) |
| AUTH-051 | Login/tokens/sesiones | **Prueba preparada (GREEN fixture)** | [resultado](../AUTH-051/resultado.md) |
| AUTH-052 | Login/tokens/sesiones | **Prueba preparada (GREEN referencial)** | [resultado](../AUTH-052/resultado.md) |
| AUTH-053 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-053/resultado.md) |
| AUTH-055 | Login/tokens/sesiones | **Prueba preparada (GREEN referencial)** | [resultado](../AUTH-055/resultado.md) |
| AUTH-056 | Login/tokens/sesiones | **Prueba preparada (GREEN referencial)** | [resultado](../AUTH-056/resultado.md) |
| AUTH-057 | Login/tokens/sesiones | **Prueba preparada (GREEN referencial)** | [resultado](../AUTH-057/resultado.md) |
| AUTH-058 | Login/tokens/sesiones | **Prueba preparada (GREEN referencial)** | [resultado](../AUTH-058/resultado.md) |
| AUTH-063 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-063/resultado.md) |
| AUTH-064 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-064/resultado.md) |
| AUTH-066 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-066/resultado.md) |
| AUTH-065 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-065/resultado.md) |
| AUTH-067 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-067/resultado.md) |
| AUTH-068 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-068/resultado.md) |
| AUTH-069 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-069/resultado.md) |
| AUTH-071 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-071/resultado.md) |
| AUTH-072 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-072/resultado.md) |
| AUTH-073 | Login/tokens/sesiones | **Implementado local (GREEN)** | [resultado](../AUTH-073/resultado.md) |
| AUTH-074 | Login/tokens/sesiones | **Verificado local (cierre US2)** | [resultado](../AUTH-074/resultado.md) |
| AUTH-075 | Contratos/integración/cierre | **Implementado local (GREEN)** | [resultado](../AUTH-075/resultado.md) |
| AUTH-082 | Contratos/integración/cierre | **Implementado local (GREEN, Podman)** | [resultado](../AUTH-082/resultado.md) |
| AUTH-083 | Contratos/integración/cierre | **Implementado local (GREEN)** | [resultado](../AUTH-083/resultado.md) |
| AUTH-084 | Contratos/integración/cierre | **Informe parcial** | [resultado](../AUTH-084/resultado.md) |
| AUTH-076…081 | Contratos/integración/cierre | Pendiente — BLOQUEADO EXTERNO (G1/G2) | [bloque-4](bloque-4.md) |

**Bloque 2 (Registro, AUTH-026…048): COMPLETO.** 133 tests verdes (unit 38, contract 42, security 5,
integration 48); cobertura US1 86.97/72.41/90.62/89.4. Ver `agents/AUTH-048/resultado.md`.

**Bloque 4 (Contratos/integración/cierre) PARCIAL.** AUTH-075, AUTH-082 y AUTH-083 **GREEN**; AUTH-084
emitió el **informe parcial** (`specs/001-fundamentos-identidad/validation-report.md`, 439 tests, cobertura
global 88.64/73.63/88.66/89.91). Se añadió `npm run dev:swagger` para probar la API desde Swagger UI con un
stub de Users. AUTH-076–081 siguen BLOQUEADO EXTERNO (G1/G2) y la revisión humana está pendiente.

**Siguiente paso:** al recibir los contratos/proveedores de G1/G2, ejecutar AUTH-076–081 (suites
cross-service con `requireCrossServiceProviders()`), completar la revisión humana y cerrar AUTH-084.

## Resumen por plan ejecutado

### PRE-001 — Ejecución, composición y harness

- Harness compartido: `configureAuthHttp(app)` (traceId antes de guards, pipe, filtro, Swagger),
  usado por `main.ts` y `test/helpers/auth-app.ts`.
- Módulos: `CoreModule` (CLOCK/UUID/ENTROPY/config/logger) y `ServiceAuthModule`
  (verifier/guard/token provider/Users client); `AppModule` los reexporta.
- Helpers de test: `crypto-fixture` (3 pares RSA efímeros + service JWT), `fake-clock`,
  `users-stub` (HTTP en puerto efímero, fallos antes/después de mutar), `auth-app`.
- `infra/docker/auth/compose.test.yml` (Postgres 16 + Redis 7 en 127.0.0.1) y `test:cross-service`.
- Correcciones hechas: `tsconfig.build.json` excluye `jest.cross-service.config.ts` (build
  rompía con TS6059); `crypto-fixture` usa `argon2.timeCost = 2` (argon2 rechaza 1).
- Evidencia: `prisma:generate`, `typecheck`, `lint`, `test:unit` (25), `build` OK; entrypoint
  arrancado y `/health/live` + `/health/ready` 200 con Podman.

### PRE-004 — Contratos Auth ↔ Users ↔ Gateway

- `users-service.port.ts`: separadas `RegistrationIdentity` (`userId,name,email,role,status`) y
  `LoginIdentity` mínima (`userId,role,status:'ACTIVE'`).
- `auth-use-cases.port.ts` (nuevo): comandos/resultados e interfaces `execute` de
  `RegisterAccount`, `Login`, `RotateRefresh`, `ValidateSession` (compatibles con OpenAPI Auth).
- `auth-errors.ts` + `problem.mapper.ts`: `REGISTRATION_CONFLICT` y `REGISTRATION_CANCELLED` → 409.
- `agents/contrato-users-candidato.md` (nuevo): propuesta a G2 del `GET /internal/v1/registrations/{id}`,
  mapping `id`→`userId`, normalización (email trim+lowercase antes de fingerprint, password exacta),
  validación sin `exp` = sin caché positiva, `GATEWAY_BASE_URL` hasta acuerdo G1.

### PRE-002 — Persistencia y exclusión de la saga de registro

- Migración `003_registration_work` + `schema.prisma`: `processingOwner`, `leaseUntil`,
  `nextAttemptAt`, índice `(state,nextAttemptAt,leaseUntil)` y CHECK owner/lease coherentes.
- Dominio `Registration`: propiedades de lease y métodos `claim`/`renewLease`/`releaseLease`/
  `scheduleNextAttempt`/`isLeaseHeldBy`.
- `registration-work.port.ts` (nuevo): `createOrRead`, `claimOne`, `claimBatch`, `renew`, `release`,
  `transaction(context)`; resultados `claimed/busy/terminal/missing`; lease 120 s.
- `PrismaRegistrationWork`: `INSERT ... ON CONFLICT DO NOTHING` + relectura, `FOR UPDATE` en
  `claimOne`, `FOR UPDATE SKIP LOCKED` en `claimBatch`, repos Registration/Credential atados a tx.
- Readiness exige nombres de migración concretos, no `count >= 2`.
- Evidencia: integración `registration-work.spec.ts` **10/10** (dos conexiones, lease vencido,
  rollback conjunto, replay no sobrescribe, readiness).

### PRE-003 — Unidad transaccional de sesiones y revocación

- Migración `004_session_revocation` + `schema.prisma`: enum `SessionRevokeReason`
  (`REFRESH_REUSE/EXPIRED/SECURITY/USER_INACTIVE`) y `Session.revokeReason` con backfill `SECURITY`
  y CHECK de coherencia.
- Dominio `Session`: `revokeReason` y `revoke(now, reason='SECURITY')` idempotente.
- `session-unit-of-work.port.ts` (nuevo): `execute(work)` con contexto tx y
  `lockSession`/`lockRefresh`/`markConsumed`/`insertSuccessor`/`linkSuccessor`/`revokeActiveForSession`.
- `PrismaSessionUnitOfWork`: locks `FOR UPDATE` (sesión antes que token), rotación
  consume→insert→link respetando índice parcial y FK; reintentos máx. 3 solo para `P2034`/`40001`/`40P01`.
  **No** se registra en `AppModule` (lo hará AUTH-072).
- Evidencia: integración `session-unit-of-work.spec.ts` **6/6** (rollback, reason+version, orden de
  rotación, un ACTIVE por sesión, commit de replay, locks serializados).

### AUTH-026 — Pruebas HTTP del registro (RED)

- `test/contract/registration.contract.spec.ts` (nuevo): matriz completa sobre un controlador fixture
  test-local (se sustituye por `RegistrationController` en AUTH-045) + stub tipado de
  `REGISTER_ACCOUNT_USE_CASE`, service JWT reales y `configureAuthHttp`.
- Cubre happy path GUEST/OWNER (solo `id/name/email/role`), password exacta (8/128 y Unicode),
  12 casos 400, 6 casos 401 (incluye clave foránea), 409/503 con `problem+json` y `traceId`, y un caso
  RED de ruta ausente (404).
- Evidencia: `typecheck` y `lint` OK; suite **31 tests: 29 pasan, 2 fallan RED esperado** por ausencia de
  normalización `trim` (ver `agents/AUTH-026/resultado.md`). GREEN queda para AUTH-045.

### AUTH-030 — Pruebas de concurrencia del registro

- `test/integration/registration-concurrency.spec.ts` (nuevo): 7 pruebas con dos conexiones
  `PrismaService` sobre PostgreSQL real (sin simular locks).
- Cubre fila inicialmente ausente + creación simultánea (una fila, `userId` ganador estable y fingerprint
  persistido), replay con fingerprint distinto sin sobrescribir, credencial intacta, reclamo exclusivo,
  lease vencido recuperable y rechazo del owner viejo, lotes disjuntos con SKIP LOCKED y estado terminal.
- Evidencia: `typecheck` y `lint` OK; suite **7/7** y proyecto de integración **23/23** sin regresiones.
- Pendiente de AUTH-040/042: mapeo a `IdempotencyConflictError` y saga completa simultánea (ver
  `agents/AUTH-030/resultado.md`).
- **Corrección posterior:** la suite destapó que `claimBatch` no acotaba el `UPDATE` bajo contención;
  se cambió a `WITH selected AS (... FOR UPDATE SKIP LOCKED) UPDATE ... FROM selected`.

### AUTH-031 — Pruebas de recuperación de la saga

- `test/integration/registration-saga.spec.ts` (nuevo): 11 pruebas con `ReferenceRegistrationCoordinator`
  (fixture test-local del futuro `RegisterAccountUseCase`, protocolo D03), `StubUsersAdapter` HTTP e
  inyección de fallos por frontera; PostgreSQL real + `UsersStub`.
- Cubre happy path, reinicio en las cuatro fronteras durables, Users caído, timeout antes/después de mutar
  (sin cancelar un User `ACTIVE`), `IdempotencyConflictError`, `RegistrationConflictError` y login parcial.
- Corrección productiva: `PrismaRegistrationWork.claimBatch` con patrón `UPDATE ... FROM` (ver detalle en
  `agents/AUTH-031/resultado.md`).
- Evidencia: `typecheck`/`lint`/`test:unit`/`build` OK; integración **4 suites, 34 tests** (saga 11/11).
- Pendiente de AUTH-040/041/042: sustituir el coordinador y el adapter de referencia por los productivos y
  re-ejecutar en AUTH-048.

### AUTH-032 — Pruebas del reconciliador

- `test/integration/registration-reconciler.spec.ts` (nuevo): 10 pruebas con `ReferenceRegistrationReconciler`
  (fixture test-local D03) sobre PostgreSQL real + `UsersStub` y fake clock.
- `test/helpers/reference-registration.ts` (nuevo): extrae adapter, coordinador + `advanceClaimedRegistration`,
  reconciliador y scheduler de referencia, reutilizados por AUTH-031/AUTH-032.
- `test/helpers/users-stub.ts`: `failNext` ahora encola fallos y admite `pathEndsWith`.
- Cubre ambos-ACTIVE tras TTL, PENDING con hash, espera sin contar intentos + compensación tras TTL,
  CANCELLED remoto, COMPENSATING persistente, 409/ACTIVE al compensar, backoff 30/60/120/240, fila no
  elegible, procesamiento disjunto con dos workers y parada limpia del scheduler.
- Evidencia: `typecheck`/`lint`/`test:unit`/`build` OK; integración **5 suites, 44 tests**, estable.
- Pendiente de AUTH-043: sustituir reconciliador/scheduler de referencia por los productivos (paso 6).

### AUTH-033 — Pruebas y corrección de secretos en registro

- `src/infrastructure/observability/auth-logger.ts`: política de logging por claves permitidas; `Error` →
  `{name,kind}` sin `message`/`stack`; arrays → `{count}`; objetos anidados filtrados.
- `src/interfaces/http/problem.filter.ts`: deja de loguear la excepción cruda; registra `code/status/traceId`.
- `test/security/registration-secrets.spec.ts` (nuevo): 5 pruebas con marcadores sintéticos (password, hash,
  service JWT, email) sobre stdout, stderr y `emitTelemetryLog` (OTel mockeado) + problemas 500/503/409/401.
- Evidencia: `typecheck`/`lint`/`build` OK; unit+security+integration **12 suites, 74 tests**.
- Pendiente de AUTH-042/045: recorridos de saga reales; AUTH-083: span/telemetría.

### AUTH-041 — Adapter Users para registro

- `src/infrastructure/http/users-registration.client.ts` (nuevo): `UsersRegistrationClient` con
  `createPendingUser`/`getRegistration`/`activateRegistration`/`cancelRegistration` sobre `UsersServiceClient`.
- `users-service.types.ts`: `UsersServiceUserSummary` y `UsersServicePendingUserBody`.
- `test/contract/users-registration-adapter.spec.ts` (nuevo): 12 pruebas contra `UsersStub` HTTP real
  (propagación de bearer/key/traceId, repetición idempotente, 404→null, 409 create/activate/cancel mapeados,
  5xx→dependencia, validación runtime de UUID/role/status/userId).
- Evidencia: `typecheck`/`lint`/`build`/`test:unit` OK; contrato **12/12**.
- Pendiente: AUTH-063 (`resolveLoginIdentity`), AUTH-072/046 (composición), AUTH-076/079 (G2).

### AUTH-040 — RegisterAccountUseCase

- `src/application/registration/advance-registration.service.ts` (nuevo): avance D03 compartido
  (`advance(registration, input|null, traceId)`), normalización y persistencia por checkpoint.
- `src/application/registration/register-account.use-case.ts` (nuevo): `RegisterAccountService.execute`
  (`createOrRead` → fingerprint → lease → avance → resumen público), sin Nest/Prisma.
- `test/unit/register-account.use-case.spec.ts` (nuevo): 8 pruebas con dobles en memoria (orden, hash único,
  idempotencia/repetición, fingerprint distinto, reanudación sin re-hash, lease, fallo transitorio,
  no-éxito sin ambos ACTIVE, cancelada).
- Evidencia: `typecheck`/`lint`/`build` OK; unit **7 suites, 33 tests**; integración **44 tests** sin regresiones.
- Pendiente de AUTH-042/046: conexión con Users real y composición del módulo.

### AUTH-042 — Conexión de la saga con Users

- `register-account.use-case.ts`: `owner` explícito, manejo de fallo transitorio (registra y libera lease) y
  liberación del lease al completar; conflictos se propagan, el resto se traduce a 503.
- `advance-registration.service.ts`: `recordTransientFailure` (`lastErrorCode`, `nextAttemptAt`, release).
- `registration-saga.spec.ts` reescrita contra `RegisterAccountService` + `UsersRegistrationClient` reales
  sobre `UsersStub` (12 pruebas: happy path, reanudación por estado, caída/timeout de Users, 409 de
  key/correo, sin identidad parcial).
- Evidencia: `typecheck`/`lint`/`build` OK; unit **33 tests**, security **5**, integración **45 tests**.
- Pendiente de AUTH-043/046: reconciliador productivo y composición del módulo.

### AUTH-043 — Reconciliación programada

- `src/application/registration/reconcile-registrations.use-case.ts` (nuevo): `ReconcileRegistrationsUseCase`
  (reclamo por lotes, tabla D03 con `advance(..., null, ...)`, backoff 30/60/120/240→300, maxAttempts,
  compensación persistente) y token `RECONCILE_REGISTRATIONS`.
- `src/modules/registration/registration-reconciler.service.ts` (nuevo): scheduler Nest con `tick()` y
  `onModuleDestroy`.
- `auth-config.ts`: `defaultedInteger` + defaults reales del reconciliador 30/900/50/5.
- `registration-reconciler.spec.ts` reescrita contra el reconciliador productivo (10/10) con scheduler;
  `test/unit/auth-config.spec.ts` (3/3); se elimina `test/helpers/reference-registration.ts`.
- Evidencia: `typecheck`/`lint`/`build` OK; unit **36 tests**, security **5**, integración **45 tests**.
- Pendiente de AUTH-046: registrar el caso de uso y el scheduler en el módulo de registro.

### AUTH-045 — Controlador interno de registro

- `src/interfaces/http/registration.controller.ts` (nuevo): `RegistrationController` + `IdempotencyKeyPipe`
  + decoradores Swagger (`orchestrateRegistration`, `serviceAuth`, header, 201/400/401/409/503).
- `register.request.ts`: `@Transform` de `trim` en `name`/`email`.
- `registration.contract.spec.ts` reescrita contra el controlador real (se retira el fixture y el 404 RED):
  **30/30**.
- Evidencia: `typecheck`/`lint`/`build` OK; unit **36**, security **5**, integración **45**.
- Pendiente de AUTH-046/047: composición del módulo y sincronización OpenAPI.

### AUTH-046 — Composición de módulos

- `src/modules/credentials/credentials.module.ts` (nuevo): hasher y repositorio de credenciales con sus
  tokens.
- `src/modules/registration/registration.module.ts` (nuevo): registra `RegistrationController` y
  `RegistrationReconcilerService`, provee `REGISTRATION_WORK`, `UsersRegistrationClient`,
  `AdvanceRegistrationService`, `REGISTER_ACCOUNT_USE_CASE` y `RECONCILE_REGISTRATIONS` con factories.
- `app.module.ts` importa `RegistrationModule` y elimina providers movidos.
- `test/integration/registration-module.spec.ts` (nuevo): bootstrap real de `AppModule` (providers,
  registro HTTP end-to-end y health).
- Evidencia: `typecheck`/`lint`/`build` OK; unit **36**, security **5**, integración **48 tests**.
- Pendiente de AUTH-047/048: OpenAPI y cierre de US1.

### AUTH-047 — OpenAPI de registro

- `dto/problem.response.ts` (nuevo): `Problem` con `instance`/`errors`; nombres de schema estables
  (`RegisterCommand`, `UserSummary`) vía `@ApiSchema`.
- `registration.controller.ts`: respuestas `application/problem+json` y **401** añadido.
- `openapi.factory.ts`: `additionalProperties: false` en `RegisterCommand`/`LoginCommand` del documento.
- YAML: 401, `Problem.instance/errors` y descripciones de normalización.
- `test/unit/openapi.factory.spec.ts` (nuevo): 2/2 validando operación, respuestas, security y schemas.
- Evidencia: `openapi:check` OK; unit **38**, contract **42**, security **5**, integración **48**.

### AUTH-048 — Cierre US1 (verificación)

- Migraciones verificadas desde base vacía (001/002) y desde 001/002 (003/004); `migrate status` al día.
- Batería de registro (unit+integration+contract+security, patrón `registration`): **12 suites, 110 tests,
  0 omitidos**. Total del servicio: unit 38 + contract 42 + security 5 + integration 48 = **133**.
- Cobertura US1 afectada: **86.97% stmts / 72.41% branches / 90.62% funcs / 89.4% lines** (umbral global del
  repo intacto en 70). Trazabilidad FR-001–006 y FR-024 mapeada en `agents/AUTH-048/resultado.md`.
- Bloqueo externo declarado: aceptación G2 del `GET /internal/v1/registrations/{id}` y `UserSummary`
  (AUTH-076/079).

## Bloque 3 — Login, tokens y sesiones (COMPLETO)

Estado: **Bloque 3 (Login/tokens/sesiones) COMPLETO — AUTH-049–053, 055–058, 063–069, 071–074**, incluido el
cierre US2 (AUTH-074) con cobertura global 88.44% y afectada ≥75%.
Orden de `agents/README.md`: AUTH-049, 050, 051, 052, 053, 055, 056, 057, 058, 063, 064, 066, 065, 067, 068,
069, 071, 072, 073, 074.

Convención (igual que los bloques anteriores):

- Cada plan se ejecuta **uno por conversación** y deja su evidencia en `agents/<ID>/resultado.md`.
- Al terminar, se actualiza su fila en la tabla de **Progreso** y se añade un resumen en esta sección.
- Las suites RED de sesiones/login se vuelven a ejecutar cuando su implementación queda conectada
  (AUTH-071/072/073) y en el cierre AUTH-074.

### Resumen por plan ejecutado (se completará al ejecutar)

### AUTH-049 — Pruebas HTTP de login (RED)

- `test/contract/login.contract.spec.ts` (nuevo): `LoginFixtureController` test-local (se sustituye por
  `LoginController` en AUTH-071), doble tipado de `LOGIN_USE_CASE`, `ServiceJwtVerifier`/guard/pipe/filtro
  reales y claves RSA efímeras.
- Cubre 200 con `InternalTokenPair` completo (tres roles, `expiresIn` entero 3600, UUIDs, sin `Set-Cookie`),
  reenvío exacto de email/password/traceId, 9 casos 400 antes del caso de uso, 401 genérico idéntico,
  429 `LOGIN_RATE_LIMITED`, 503 y 7 casos 401 de service JWT. Un caso RED por ruta ausente (404).
- Evidencia: `typecheck`/`lint` OK; suite **27 tests: 25 pasan, 2 fallan RED esperado** (`trim` de email
  y `Retry-After`, pendientes de AUTH-071/064). Sin cambios productivos.

### AUTH-050 — Pruebas HTTP de refresh (GREEN fixture)

- `test/contract/refresh.contract.spec.ts` (nuevo): `RefreshFixtureController` test-local (se sustituye por
  `SessionsController` en AUTH-071), doble tipado de `ROTATE_REFRESH_TOKEN_USE_CASE` y harness real.
- Cubre 200 con `InternalTokenPair` rotado (sin `Set-Cookie`), 6 casos 400 + cookie-only, 401 genérico para
  desconocido/vencido/consumido/revocado, 503 de persistencia y 7 casos 401 de service JWT; el `problem` nunca
  expone el raw token. Un caso 404 documenta la ruta productiva ausente.
- Evidencia: `typecheck`/`lint` OK; suite **22/22**. Sin cambios productivos.

### AUTH-051 — Pruebas HTTP de introspección (GREEN fixture)

- `test/contract/session-validation.contract.spec.ts` (nuevo): `ValidateFixtureController` test-local (se
  sustituye por `SessionsController` en AUTH-071), doble tipado de `VALIDATE_SESSION_USE_CASE` y harness real.
- Cubre 200 con exactamente `{active:true, role}` para tres roles (sin `userId`/`sessionId`), 10 casos 400
  (UUID ausentes/malformados, `role`/`sid`/`accessToken`/`exp`/desconocidos), 401 genérico idéntico para
  inexistente/revocada/vencida/mismatch, 503 de BD y 7 casos 401 de service JWT. Un caso 404 documenta la
  ruta productiva ausente.
- Evidencia: `typecheck`/`lint` OK; suite **23/23**. Sin cambios productivos.

### AUTH-052 — Pruebas unitarias de LoginUseCase (GREEN referencial)

- `test/helpers/reference-login.ts` (nuevo): `ReferenceLoginService` (referencia test-local del futuro
  `LoginUseCase`, se sustituye en AUTH-065) con puertos dobles `FakeLoginRateLimiter`,
  `FakeSessionTokenIssuer`, `FakeSessionUnitOfWork`, `FakeCredentialRepository`, `FakePasswordHasher`.
- `test/unit/login.use-case.spec.ts` (nuevo): éxito por tres roles, ramas negativas con `InvalidCredentialsError`
  y `verifyWithEquivalentCost(null, ...)`, prueba de que la seguridad no depende del boolean del hasher,
  normalización email/password y resolución en Users por login, rate limit (1–5 → 401, sexto → 429, bloqueo
  previo, limpieza) y fallos de dependencia fail-closed (Users/DB/Redis/UoW).
- `test/unit/argon2-password-hasher.spec.ts` (nuevo): Argon2 real — `$argon2id$`, exactitud Unicode, salt
  distinta, hash inválido → false y hash señuelo.
- Evidencia: `typecheck`/`lint` OK; **2 suites, 26 tests, 0 fallos**. Sin cambios productivos.

### AUTH-053 — Verificación de access JWT (GREEN)

- `src/application/ports/token-signer.port.ts`: nuevo `VerifiedAccessTokenClaims` (`iat`/`exp` numéricos);
  `verifyAccessToken` devuelve ese tipo.
- `src/infrastructure/security/rs256-token.service.ts`: `verifyAccessToken` valida UUID en `sub/sid/jti`, rol
  allowlist, `iat`/`exp` numéricos, `exp-iat === 3600`, `iat` no futuro y lookup de `kid` por propiedad propia.
- `test/unit/access-token.spec.ts` (nuevo, 27 tests con RSA real y `jose`): firma canónica, round-trip,
  rechazos (UUID/rol/tiempos/lifetime/issuer/aud/kid/firma foránea/HS256/malformados) y rotación de key ring.
- RED documentado de la implementación previa: no validaba UUIDs, lifetime, `iat` futuro ni devolvía
  `iat`/`exp`. Evidencia: `typecheck`/`lint`/`build` OK; unit **12 suites, 91 tests**.

### AUTH-055 — Rotación, replay y concurrencia (GREEN referencial)

- `test/helpers/reference-refresh-rotation.ts` (nuevo): `ReferenceRotateRefreshTokenService` (referencia del
  futuro `RotateRefreshTokenUseCase`, se sustituye en AUTH-067), codec HMAC-SHA256 y `StubAccessTokenSigner`.
- `test/integration/refresh-rotation.spec.ts` (nuevo, PostgreSQL real + dos conexiones + barrera): rotación con
  un único sucesor ACTIVE y expiry login+7d, solo HMAC persistido, desconocido/revocado/vencido/sesión
  revocada, replay que revoca la familia sin tocar otra sesión, commit del replay antes del 401, rollback por
  fallo de firma e insert, y dos rotaciones concurrentes del mismo token (una rota, otra replay, 0 ACTIVE).
- Evidencia: `typecheck`/`lint` OK; suite **10/10**; proyecto de integración **7 suites, 58 tests**.
  Sin cambios productivos.

### AUTH-056 — Rate limit Redis (GREEN referencial)

- `test/helpers/reference-redis-rate-limiter.ts` (nuevo): `ReferenceRedisLoginRateLimiter` con Lua atómico
  (`INCR`+`PEXPIRE`+`PTTL`) implementando D05 sobre la interfaz `LoginRateLimiter` de AUTH-052.
- `test/integration/login-rate-limit.spec.ts` (nuevo, Redis 7 DB15 real): clave solo HMAC (sin correo),
  5×401 + 6º 429 con `Retry-After` 1–900 sin prolongar ventana, variantes comparten contador, limpieza en
  éxito, bloqueo antes de Users/Argon2, expiración con `PEXPIRE`, 12 fallos concurrentes exactos y fail-closed
  (Redis caído / `clear` fallido sin sesión).
- Evidencia: `typecheck`/`lint` OK; suite **10/10**; proyecto de integración **8 suites, 68 tests**.
  Sin cambios productivos.

### AUTH-057 — Validación y caché de sesión (GREEN referencial)

- `test/helpers/reference-session-validation.ts` (nuevo): `ReferenceValidateSessionService` (referencia del
  futuro `ValidateSessionUseCase`, se sustituye en AUTH-068) con PostgreSQL autoritativo y caché best-effort,
  más dobles `ThrowingSessionRepository`/`UnavailableAuthCache`.
- `test/integration/session-validation.spec.ts` (nuevo, Postgres 16 + Redis 7 reales vía `PrismaSessionRepository`
  y `AuthCacheAdapter`): tres roles, inválidas (desconocida/mismatch/revocada/vencida/replay), caché obsoleta sin
  resucitar, BD caída + hit → 503, Redis caído + BD activa → 200, JSON corrupto ignorado, política de caché
  positiva (`min(exp-now, absoluteExpiry-now)`, sin TTL ≤ 0) y rol sin consultar Users.
- Evidencia: `typecheck`/`lint` OK; suite **17/17**; proyecto de integración **9 suites, 85 tests**.
  Sin cambios productivos.

### AUTH-058 — Guards, roles y service JWT (GREEN referencial)

- `test/helpers/reference-authentication.ts` (nuevo): `ReferenceAccessTokenGuard` (JWT + sesión autoritativa,
  preserva 503) y `ReferenceRolesGuard` (metadata + principal validado); se sustituyen en AUTH-069.
- `test/helpers/crypto-fixture.ts`: añade `issueAccessToken` e `issueOutboundServiceToken`.
- `test/security/authentication-authorization.spec.ts` (nuevo, 41 tests, controladores solo de test): matriz
  401 (firma/kid/issuer/aud/exp/alg none/HS256/malformado/sesión/sub/role), 503 de dependencia, 403 vs 200 por
  rol, principal inmune a cabeceras/body, service JWT en las cuatro rutas internas (inbound ok; ausente/user/
  outbound/scope/issuer/aud/exp → 401), `traceId` conservado sin filtrar el bearer y rotación de claves.
- Evidencia: `typecheck`/`lint` OK; suite **41/41**; proyecto de seguridad **2 suites, 46 tests**.
  Sin cambios productivos.

### AUTH-063 — Lookup de identidad para login (GREEN)

- `src/infrastructure/http/users-login-identity.client.ts` (nuevo): `UsersLoginIdentityClient.resolveLoginIdentity`
  sobre `UsersServiceClient` (body `{email}` normalizado, service JWT, traceId, `idempotent:true`).
- Valida `userId` UUID, rol allowlist y `status === 'ACTIVE'`; devuelve solo esos campos; 404 → `null`; 200
  PENDING/CANCELLED o inválido → `DependencyUnavailableError`; timeout/circuito/5xx/401/403/JSON inválido → 503.
- `test/contract/users-login-identity-adapter.spec.ts` (nuevo, 20 tests): shape, normalización, 404, errores,
  reintento idempotente, circuito abierto, violaciones de contrato y descarte de perfil.
- Evidencia: `typecheck`/`lint` OK; suite **20/20**; contrato **134 tests (132 pasan; 2 RED esperados de
  AUTH-049)**.

### AUTH-064 — Rate limiter y Retry-After (GREEN)

- `src/application/login/login-rate-limiter.ts` (nuevo): `LoginRateLimiter` + token `LOGIN_RATE_LIMITER` +
  `LoginRateLimiterService` (normaliza, HMAC-SHA256 del identificador, ventana fija 900 s, límite 6,
  fail-closed `DependencyUnavailableError`).
- `cache.port.ts`/`auth-cache.adapter.ts`: `readLoginFailures`/`recordLoginFailure` con Lua atómico
  (`INCR`+`PEXPIRE`+`PTTL`), reparación atómica de TTL ausente y cliente Redis opcional inyectable (test).
- `auth-config.ts` + `.env.example`: `AUTH_LOGIN_IDENTIFIER_HMAC_SECRET` (≥32, separado de refresh/fingerprint).
- `problem.filter.ts`: `Retry-After` entero ≥1 en 429; el cuerpo sigue genérico.
- Pruebas: `test/unit/login-rate-limiter.spec.ts` (11) y `test/integration/login-rate-limit.spec.ts` migrada
  a producción (11/11, +1 caso de reparación de TTL). Se elimina `test/helpers/reference-redis-rate-limiter.ts`.
- Evidencia: `typecheck`/`lint`/`build` OK; unit **13 suites, 102 tests**; security **46**; integración
  **9 suites, 86 tests**; contrato **133 pasan + 1 RED esperado (trim de email, AUTH-071)**.

### AUTH-066 — Preparar y firmar pares de tokens (GREEN)

- `src/application/ports/refresh-token-codec.port.ts` (nuevo): puerto `RefreshTokenCodec`.
- `src/infrastructure/security/hmac-refresh-token.codec.ts` (nuevo): 32 bytes `base64url` + HMAC-SHA256 hex
  con `refreshTokenHmacSecret`.
- `src/application/sessions/issue-session-tokens.service.ts` (nuevo): `ISSUE_SESSION_TOKENS` +
  `SessionTokensIssuer` + `IssueSessionTokensService` (`issueNewSession` login, `issueForSession` rotación,
  `issueTokens` compartido; UUID/Clock, 7 días, claims mínimos y rol de la sesión).
- Pruebas: `test/unit/issue-session-tokens.spec.ts` (12) con codec y firmante RS256 reales.
- Evidencia: `typecheck`/`lint`/`build` OK; unit **14 suites, 114 tests, 0 fallos**.

### AUTH-065 — Login y creación atómica de sesión (GREEN)

- `src/application/login/login.use-case.ts` (nuevo): `LoginService` productivo (`inspect` → Users →
  credencial ACTIVE/`verifyWithEquivalentCost` → `issueNewSession` → UoW `clear`+`saveSession`+`insertSuccessor`).
- `test/helpers/reference-login.ts`: se elimina `ReferenceLoginService` (queda solo como dobles de test).
- `test/unit/login.use-case.spec.ts` y `test/integration/login-rate-limit.spec.ts` migradas al `LoginService`.
- `test/integration/login-persistence.spec.ts` (nuevo, 7): PostgreSQL/Redis reales, `UsersStub` HTTP y Argon2
  real; éxito tres roles, credencial ausente, password errónea, `clear` fallido y fallo técnico de persistencia.
- Evidencia: `typecheck`/`lint`/`build` OK; unit **14/114**; security **46**; integración **10 suites, 93
  tests**; contrato **133 pasan + 1 RED esperado (trim de email, AUTH-071)**.

### AUTH-067 — Rotación y revocación por replay (GREEN)

- `src/application/sessions/rotate-refresh-token.use-case.ts` (nuevo): `RotateRefreshTokenService` con lookup
  por HMAC, `UoW` (lock sesión→token), replay `REFRESH_REUSE` commit + 401 fuera de la transacción, rotación
  `markConsumed`→`insertSuccessor`→`linkSuccessor`→`incrementVersion`, firma antes del commit y caché
  best-effort.
- `src/domain/sessions/session.ts`: nuevo `incrementVersion()`.
- `test/unit/rotate-refresh-token.use-case.spec.ts` (nuevo, 9) y `test/integration/refresh-rotation.spec.ts`
  migrada a producción (11, con caché caída y fallo tras `insertSuccessor`). Se retira la referencia de
  `test/helpers/reference-refresh-rotation.ts` (queda `StubAccessTokenSigner`).
- Evidencia: `typecheck`/`lint`/`build` OK; unit **15 suites, 123 tests**; security **46**; integración
  **10 suites, 94 tests**; contrato **133 pasan + 1 RED esperado (trim de email, AUTH-071)**.

### AUTH-068 — Introspección autoritativa (GREEN)

- `src/application/sessions/validate-session.use-case.ts` (nuevo): `ValidateSessionService` con PostgreSQL
  autoritativo, 401 genérico, `503` ante fallo de BD, caché best-effort y TTL positivo
  `min(exp-now, absoluteExpiry-now)`.
- `test/unit/validate-session.use-case.spec.ts` (nuevo, 14) y `test/integration/session-validation.spec.ts`
  migrada a producción (17/17). Se retira la referencia de `test/helpers/reference-session-validation.ts`
  (quedan los dobles).
- Evidencia: `typecheck`/`lint`/`build` OK; unit **16 suites, 137 tests**; security **46**; integración
  **10 suites, 94 tests**; contrato **133 pasan + 1 RED esperado (trim de email, AUTH-071)**.

### AUTH-069 — Passport y guards de usuario (GREEN)

- Dependencias nuevas con versión exacta: `@nestjs/passport@10.0.3`, `passport@0.7.0`, `passport-custom@1.2.1`
  (`@types/passport@1.0.17` dev).
- `src/interfaces/http/auth/authenticated-principal.ts` y `auth/jwt.strategy.ts`: estrategia `access-jwt` sobre
  `passport-custom` que delega la criptografía al `TokenSigner` y exige sesión autoritativa + rol coincidente.
- `src/interfaces/http/guards/access-token.guard.ts` (401/503), `roles.guard.ts` (401/403) y `roles.decorator.ts`.
- `test/security/authentication-authorization.spec.ts` migrada a los guards productivos (41/41); se elimina
  `test/helpers/reference-authentication.ts`.
- Evidencia: `typecheck`/`lint`/`build` OK; security **2 suites, 46 tests**; sin regresiones en unit/integration.

### AUTH-071 — Controladores de login, refresh e introspección (GREEN)

- `src/interfaces/http/login.controller.ts` (nuevo) y `sessions.controller.ts` (nuevo, `refresh` +
  `validate`), con `ServiceAuthGuard`, `HttpCode 200` y operationIds `login`/`rotateRefreshToken`/`validateSession`.
- DTOs: trim de email y `LoginCommand` (también cierra `additionalProperties`), tokens sin `writeOnly`,
  `expiresIn` entero 3600, `RotateRefreshCommand` con `minLength:32` documentado, helper `problemResponse`
  con `Retry-After` en el 429.
- `test/contract/{login,refresh,session-validation}.contract.spec.ts` migradas a los controladores reales
  (se retiran los fixtures y los casos RED de 404): **3 suites, 69 tests**; contrato global **131 tests, 0 RED**.
- Evidencia: `typecheck`/`lint`/`build`/`openapi:check` OK; unit **137**; security **46**; integración
  **10 suites, 94 tests**.

### AUTH-072 — Composición de Login, Sessions, Tokens y adapters (GREEN)

- `src/modules/tokens/tokens.module.ts`, `modules/sessions/sessions.module.ts` y `modules/login/login.module.ts`
  (nuevos): signer/codec/issuer, repos+UoW+rotación+validación+guards+`SessionsController`, y
  limiter+`LoginService`+`LoginController`.
- `src/infrastructure/http/users-service.adapter.ts` (nuevo) y `USERS_SERVICE` en `ServiceAuthModule`; el
  registro reutiliza el adapter exportado (sin instancias duplicadas).
- `src/app.module.ts` compone los módulos y deja `TraceInterceptor` como provider local.
- `test/integration/auth-modules.spec.ts` (nuevo, 4): DI real, recorrido register→login→validate→refresh→
  replay→validate 401, health y fallo de bootstrap sin config.
- Evidencia: `typecheck`/`lint`/`build`/`openapi:check` OK; integración **11 suites, 98 tests**.

### AUTH-073 — Sincronizar contratos de sesión (GREEN)

- YAML: `400` en login/refresh/validate, `minLength: 32` y descripción del `refreshToken`, descripciones de
  normalización en `LoginCommand`.
- DTOs con nombres estables (`SessionPrincipal`, `InternalTokenPair`, `ValidateSessionCommand`,
  `SessionValidation`); `openapi.factory.ts` cierra `RegisterCommand/LoginCommand/RotateRefreshCommand/
  ValidateSessionCommand/InternalTokenPair`.
- Evidencia: `openapi:check`/`typecheck`/`lint` OK; contrato **6 suites, 131 tests**; unit **137**.

### AUTH-074 — Cierre US2 (verificación)

- Migraciones en bases separadas: limpia `001–004` y upgrade `001/002 → 003/004`; constraints verificados por
  SQL (índice parcial de un refresh ACTIVE, checks de lease/revoke/version/expiry).
- Batería local: unit 17/139, contract 6/131, security 2/46, integration 11/98; **coverage 36 suites, 414
  tests, 0 fallos**.
- Cobertura global **88.44/73.87/88.37/89.7**; US2 afectado (27 archivos) **87.73/75/81.98/88.26**. Se añade
  `test/unit/users-service-adapter.spec.ts`.
- Trazabilidad FR-007–013/024 y SC-002/003 en `agents/AUTH-074/resultado.md`; caché positiva HTTP deshabilitada
  por falta de `exp` y PostgreSQL autoritativo.
- Bloqueos externos declarados: G1/G2 (AUTH-076–081), Docker (AUTH-082), Node 20.

## Entorno y comandos

- Node disponible **22.22.2**; los `engines` piden `>=20 <21`. Todo pasó igualmente (solo warnings).
- **Docker no está instalado**; se usa **Podman + podman-compose** con el mismo `compose.test.yml`.
- Dependencias instaladas (`npm ci`).

```sh
# Arrancar dependencias de integración
podman-compose -f infra/docker/auth/compose.test.yml -p stayhub-auth-test up -d
# (health) ... ; al terminar: podman-compose -f infra/docker/auth/compose.test.yml -p stayhub-auth-test down -v

# Comprobaciones base
npm run prisma:generate
npm run typecheck
npm run lint
npm run test:unit
npm run build

# Integración (requiere Postgres/Redis de compose y opt-in de limpieza)
TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration
```

Batería actual: `test:unit` **17 suites / 139 tests**; `test:integration` **11 suites / 98 tests**;
`test:security` **2 suites / 46 tests**; `test:contract` **6 suites / 131 tests, 0 RED**; total **36 suites /
414 tests**, coverage global **88.44 / 73.87 / 88.37 / 89.7**.

## Bloqueos y dependencias externas

> Actualización 2026-09-30 ([integración](../integracion/resultado.md)): el GET de registro está
> implementado en Users y verificado con Users real; Auth ya no depende del stub fuera de sus
> pruebas aisladas. Los contenedores se verificaron con `podman` + `podman-compose` (no con
> `docker`). Lo que sigue abierto se indica en cada punto.

- **G2 (users-service):** ~~implementar el GET~~ (hecho y verificado técnicamente). Queda la
  **aprobación contractual humana** de G2 del GET/`UserSummary`, que no se ha registrado.
- **G1 (gateway):** puerto público (contrato 8443 vs plan 8080) y contrato de expectativas.
  Resolver en AUTH-078/AUTH-081. Hasta entonces se usa `GATEWAY_BASE_URL`. Sin cambios.
- **Docker:** en 2026-09-28 no estaba instalado. La imagen y el arranque en contenedor se
  verificaron después con `podman` (task-04 y task-08 de la integración); `docker` sigue sin
  ejecutarse en este host.
- **Node 20:** no se probó con la versión exacta del `engines` (verificación con Node 22.22.2).

## Hallazgos pendientes (fuera del alcance de los PRE)

- `auth-config.ts` admite `AUTH_ARGON2_TIME_COST=1`, pero `argon2` exige `>=2`; un valor 1 provoca
  fallo de arranque al construir `Argon2PasswordHasher` (observado). Candidato a AUTH-033/AUTH-083.
- ~~`USERS_SERVICE` aún sin provider~~: resuelto; Auth usa los clientes HTTP reales contra Users.
- No hay controladores de Auth todavía; las rutas internas devuelven 404 (esperado).
- El `.gitignore` raíz ignora `agents/`; estos documentos no se versionan por ahora.
