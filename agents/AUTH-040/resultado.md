# AUTH-040 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: PRE-002, PRE-004, AUTH-026, AUTH-030, AUTH-031 (ejecutadas). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Implementar el coordinador de la saga de registro (`RegisterAccountUseCase`) y el avance D03 reutilizable
por el reconciliador, libres de frameworks y con checkpoints durables.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/application/registration/advance-registration.service.ts` | **Nuevo.** `AdvanceRegistrationService.advance(registration, input|null, traceId)` con la máquina D03; normalización `trim`/lowercase; `toRegistrationRole`; persiste cada avance en transacción local antes del siguiente request remoto. | No existía el avance compartido; el reconciliador (AUTH-043) lo reutiliza. |
| `apps/auth-service/src/application/registration/register-account.use-case.ts` | **Nuevo.** `RegisterAccountService.execute({idempotencyKey,input,traceId})`: `createOrRead` → fingerprint → lease → avance → resumen público. | Coordinador de la saga. |
| `apps/auth-service/test/unit/register-account.use-case.spec.ts` | **Nuevo.** 8 pruebas con dobles en memoria (`RegistrationWork`, Users, hasher, clock, uuid). | Verificar orden, idempotencia y recuperación sin infra. |

Sin imports Nest/Prisma en `src/application/registration/`: los puertos se inyectan por constructor. No se
persiste PII (solo hash de credencial).

## Comportamiento verificado (8/8 GREEN)

- **Orden D03:** `create → get → activate → get`; hash una sola vez; `COMPLETED` con User `ACTIVE` y
  Credential `ACTIVE`.
- **Idempotencia:** repetición de la misma key devuelve el mismo `id` sin filas nuevas (solo consulta Users).
- **Fingerprint distinto:** `IdempotencyConflictError` sin llamar a Users.
- **Reanudación:** `USER_PENDING` con credencial existente completa **sin recalcular el hash**.
- **Lease:** `busy` → `DependencyUnavailableError` reintentable, sin tocar Users.
- **Fallo transitorio:** conserva `STARTED` y recupera tras expirar el lease.
- **Sin doble ACTIVE:** si Users no confirma `ACTIVE`, no se marca `COMPLETED`.
- **Cancelada:** `RegistrationCancelledError`.

## Evidencia de comandos

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 7 suites, 33 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects unit \
  --runTestsByPath test/unit/register-account.use-case.spec.ts
# PASS — 8/8

# Integración (PostgreSQL/Redis de compose.test.yml): 5 suites, 44 tests — sin regresiones.
```

## Criterios de aceptación

- [x] Un registro completo y su repetición producen el mismo `id` sin filas duplicadas.
- [x] No se marca éxito antes de confirmar ambos `ACTIVE`.
- [x] Dominio/aplicación libres de frameworks y sin PII persistida.

## Pendiente / handoff

- **AUTH-042:** conectar el caso de uso con el adapter Users real, traducir errores recuperables y ejecutar
  la matriz de AUTH-030/AUTH-031 contra la implementación productiva.
- **AUTH-046:** componer `RegisterAccountService`/`AdvanceRegistrationService` en el módulo de registro.
- Sin bloqueos de infraestructura.
