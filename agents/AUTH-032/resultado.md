# AUTH-032 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN con reconciliador de referencia)**.

Dependencias: PRE-002 y PRE-004 (verificadas). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Preparar la suite del reconciliador sobre PostgreSQL real: reclamo por lotes, matriz de recuperación D03,
backoff, compensación persistente y parada limpia del scheduler, antes de que exista AUTH-043.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/integration/registration-reconciler.spec.ts` | **Nuevo**. 10 pruebas con `ReferenceRegistrationReconciler` (fixture test-local) sobre PostgreSQL real y `UsersStub`. | No existe reconciliador (AUTH-043); el fixture implementa D03 y se sustituye por el productivo. |
| `apps/auth-service/test/helpers/reference-registration.ts` | **Nuevo**. Extrae `StubUsersAdapter`, `ReferenceRegistrationCoordinator` + `advanceClaimedRegistration`, `ReferenceRegistrationReconciler`, `ReferenceReconcilerScheduler`, `backoffSecondsFor` y utilidades. | Reutilizar la infraestructura de referencia entre AUTH-031 y AUTH-032 (evita duplicación). |
| `apps/auth-service/test/integration/registration-saga.spec.ts` | Refactor: consume el helper en lugar de definir adapter/coordinador locales. | Reutilización; comportamiento de AUTH-031 sin cambios (11/11). |
| `apps/auth-service/test/helpers/users-stub.ts` | `failNext` pasa a **cola** y `UsersStubFailure` admite `pathEndsWith`. | Poder inyectar fallos distintos por endpoint (`/activate`, `/cancel`) dentro de una misma secuencia. |

No se modificó código productivo en esta tarea.

## Cobertura de la suite (10/10 GREEN)

1. Ambos ACTIVE completa **aunque el TTL local haya vencido**.
2. User `PENDING` con hash almacenado avanza a `COMPLETED` (credencial y User `ACTIVE`).
3. Sin payload: espera sin incrementar `attemptCount` (`nextAttemptAt = now + 30s`) y **compensa tras TTL**.
4. Users `CANCELLED`: revoca la credencial local y marca `CANCELLED`.
5. Cancelación no confirmable: conserva `COMPENSATING` (no inventa `CANCELLED`); al siguiente tick confirma.
6. Cancelación con 409/ACTIVE: reconsulta y completa (`finishAsActive`).
7. Backoff exacto **30/60/120/240s**; al quinto fallo de avance pasa a compensación.
8. `nextAttemptAt` futuro: la fila **no se reclama** ni incrementa contador.
9. Dos reconciliadores concurrentes procesan **conjuntos disjuntos** (cada `activate` una vez).
10. El scheduler se re-arma por tick y `stop()` cancela sin dejar handles (`jest.getTimerCount() === 0`).

`MAX_ATTEMPTS=5`, `BATCH_SIZE=50`, `INTERVAL_SECONDS=30`, `TTL=900s` verificados con fake clock (sin esperas reales).

## Evidencia de comandos

Con PostgreSQL 16 + Redis 7 de `compose.test.yml` (Podman):

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 6 suites, 25 tests
npm run build --workspace @stayhub/auth-service       # OK

TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration
# OK — 5 suites, 44 tests (reconciler 10/10), estable en ejecuciones repetidas
```

## Criterios de aceptación

- [x] Concurrencia probada contra SQL real y estados terminales no reclamados.
- [x] Compensación nunca cancela una identidad ACTIVE (la completa).
- [x] No se inventa password/payload para completar filas incompletas (espera/TTL/compensa).

## Pendiente / handoff

- **AUTH-043:** implementar `reconcile-registrations.use-case.ts` + `registration-reconciler.service.ts`
  productivos; reemplazar `ReferenceRegistrationReconciler`/`ReferenceReconcilerScheduler` y re-ejecutar
  esta suite (paso 6 del plan) registrando exactitud temporal con fake clock.
- **AUTH-042:** la compensación con 409/ACTIVE se validará también contra el caso de uso productivo.
- Sin bloqueos de infraestructura: PostgreSQL/Redis responden con `compose.test.yml`.
