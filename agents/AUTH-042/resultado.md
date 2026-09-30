# AUTH-042 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: AUTH-040 y AUTH-041 (ejecutadas). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Conectar la saga productiva con el adapter Users real, traducir errores recuperables sin exponer 500
genéricos, persistir el fallo transitorio liberando el lease propio y probar la matriz de recuperación.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/application/registration/register-account.use-case.ts` | `owner` explícito; `advance` envuelto en try/catch: errores de conflicto se propagan, el resto se registra como fallo transitorio y sale como `DependencyUnavailableError`; se libera el lease al completar. | Sin `recordTransientFailure` un timeout remoto o un fallo de persistencia dejaba el lease tomado y se mapeaba a 500. |
| `apps/auth-service/src/application/registration/advance-registration.service.ts` | Nuevo `recordTransientFailure(registration, owner)`: `lastErrorCode='DEPENDENCY_UNAVAILABLE'`, `nextAttemptAt=now`, persiste y libera el lease solo si es del worker. Nunca relanza un error de persistencia crudo. | Checkpoint recuperable y reintento inmediato. |
| `apps/auth-service/test/integration/registration-saga.spec.ts` | Reescrita para usar `RegisterAccountService` + `UsersRegistrationClient` productivos contra `UsersStub` HTTP (se retira el coordinador de referencia). 12 pruebas. | Cerrar la integración real Auth↔Users en local. |
| `apps/auth-service/test/unit/register-account.use-case.spec.ts` | La prueba de fallo transitorio ahora verifica `lastErrorCode`, lease liberado y reintento inmediato. | Cubrir el paso 4 a nivel unitario. |

`auth-errors.ts` y `problem.mapper.ts` no requirieron cambios: ya mapean conflictos de registro a 409 y
`DependencyUnavailableError` a 503, con `safeDetail` (sin mensaje remoto).

## Cobertura de la suite (12/12 GREEN)

- Happy path: User `ACTIVE`, Credential `ACTIVE`, Registration `COMPLETED`, lease liberado, sin contraseña en
  las requests capturadas.
- Repetición de la misma key: mismo `id`, una sola llamada nueva a Users (resumen).
- Reanudación desde `USER_PENDING`, `CREDENTIAL_PENDING` y `CREDENTIAL_ACTIVE` (con Users `PENDING` y
  `ACTIVE`): una identidad y una credencial, sin duplicar filas.
- Users caído en create: 503, `STARTED` preservado, `lastErrorCode` y lease liberado; reintento inmediato
  completa.
- Timeout tras create (`after`): User quedó `PENDING`, local `STARTED`; reintento idempotente completa.
- Timeout tras activate (`after`): User quedó `ACTIVE`; reintento **no cancela**, completa.
- Fingerprint distinto: `IdempotencyConflictError` sin tocar Users; una sola fila.
- Correo duplicado: `RegistrationConflictError`; no cambia la identidad ganadora.
- Identidad no autenticable antes de completar (User `PENDING`); `ACTIVE` solo al final.

## Evidencia de comandos

Con PostgreSQL 16 + Redis 7 de `compose.test.yml` (Podman):

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 7 suites, 33 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects security   # OK — 5 tests

TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration
# OK — 5 suites, 45 tests (saga 12/12)
```

## Criterios de aceptación

- [x] Las interrupciones remotas previstas terminan en 503 o en reanudación correcta, no en 500 genérico.
- [x] Un 409 no cambia credencial ni identidad ganadora.
- [x] No hay éxito parcial ni eliminación de un User `ACTIVE`.

## Pendiente / handoff

- **AUTH-043:** reconciliador productivo; sustituir `ReferenceRegistrationReconciler`/scheduler y limpiar el
  `ReferenceRegistrationCoordinator` ya sin uso en `test/helpers/reference-registration.ts`.
- **AUTH-046:** composición del módulo de registro y `USERS_SERVICE`.
- Sin bloqueos de infraestructura.
