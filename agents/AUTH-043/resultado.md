# AUTH-043 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: AUTH-032 y AUTH-042 (ejecutadas). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Implementar la reconciliación programada productiva (caso de uso + scheduler Nest) sobre el avance D03,
con backoff, compensación persistente y parada limpia, y re-ejecutar la matriz de AUTH-032 contra el código
real.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/application/registration/reconcile-registrations.use-case.ts` | **Nuevo.** `ReconcileRegistrationsUseCase.execute()` (reclama lote con owner/lease, aplica la tabla D03 con `AdvanceRegistrationService.advance(..., null, ...)`, backoff `min(30·2^(n-1),300)`, maxAttempts, compensación persistente). | No existía reconciliador. |
| `apps/auth-service/src/modules/registration/registration-reconciler.service.ts` | **Nuevo.** Scheduler Nest con `setTimeout` reprogramado al final del tick, `tick()` para pruebas y `onModuleDestroy` que cancela el handle. | Ejecución de fondo sin solapamiento local. |
| `apps/auth-service/src/infrastructure/config/auth-config.ts` | `defaultedInteger` y defaults reales del reconciliador **30/900/50/5**. | `integer()` exigía las variables; los planes piden defaults documentados. |
| `apps/auth-service/test/integration/registration-reconciler.spec.ts` | Reescrita contra `ReconcileRegistrationsUseCase` + `UsersRegistrationClient` productivos (10 pruebas) e incluye el scheduler Nest. | Integración real; se retira el reconciliador de referencia. |
| `apps/auth-service/test/unit/auth-config.spec.ts` | **Nuevo.** 3 pruebas de defaults/valores/validación del reconciliador. | Cubrir el paso 5. |
| `apps/auth-service/test/helpers/reference-registration.ts` | **Eliminado** (ya sin uso). | Limpieza del andamiaje de AUTH-031/032. |

`advance-registration.service.ts` no requirió cambios: el reconciliador consume su `advance` público.

## Comportamiento verificado (10/10 GREEN)

1. Ambos `ACTIVE` completa aunque el TTL local haya vencido.
2. `USER_PENDING` con hash almacenado avanza a `COMPLETED`.
3. Sin payload: espera sin contar intentos y compensa tras TTL.
4. Users `CANCELLED`: revoca credencial y marca `CANCELLED`.
5. Cancelación no confirmable: conserva `COMPENSATING`; el siguiente tick confirma.
6. 409/ACTIVE al compensar: reconsulta y completa.
7. Backoff exacto 30/60/120/240s; 5º fallo de avance → compensación.
8. `nextAttemptAt` futuro: la fila no se reclama ni incrementa contador.
9. Dos reconciliadores concurrentes procesan conjuntos disjuntos (un `activate` por fila).
10. El scheduler se re-arma por tick y `onModuleDestroy` cancela sin dejar handles.

El ciclo no mantiene transacciones DB abiertas durante el HTTP: `advance` abre transacciones breves por
checkpoint y el cliente HTTP se ejecuta fuera de ellas.

## Evidencia de comandos

Con PostgreSQL 16 + Redis 7 de `compose.test.yml` (Podman):

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 8 suites, 36 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects security   # OK — 5 tests

TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration
# OK — 5 suites, 45 tests (reconciler 10/10)
```

## Criterios de aceptación

- [x] Cada fila converge a `COMPLETED`/`CANCELLED` cuando las dependencias responden y hay datos.
- [x] Los errores externos conservan progreso durable y reintento (backoff/`nextAttemptAt`).
- [x] Se detiene limpiamente y respeta lotes, locks y TTL.

## Pendiente / handoff

- **AUTH-046:** registrar `ReconcileRegistrationsUseCase` bajo `RECONCILE_REGISTRATIONS` y
  `RegistrationReconcilerService` en el módulo de registro.
- **AUTH-048:** cierre de US1 con cobertura y trazabilidad.
- Sin bloqueos de infraestructura.
