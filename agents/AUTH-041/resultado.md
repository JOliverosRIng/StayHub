# AUTH-041 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: PRE-001 y PRE-004 (verificadas). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Implementar el adapter de registro `Auth → Users` sobre el transporte existente, con validación de
respuestas en runtime y mapeo de errores seguro, sin integrar aún el lookup de login.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/infrastructure/http/users-registration.client.ts` | **Nuevo.** `UsersRegistrationClient` con `createPendingUser`, `getRegistration`, `activateRegistration`, `cancelRegistration` sobre `UsersServiceClient` (rutas D07). | Faltaba el adapter tipado; `USERS_SERVICE` no tenía provider. |
| `apps/auth-service/src/infrastructure/http/users-service.types.ts` | Añade `UsersServiceUserSummary` y `UsersServicePendingUserBody`. | Tipar la respuesta/el payload del contrato candidato. |
| `apps/auth-service/test/contract/users-registration-adapter.spec.ts` | **Nuevo.** 12 pruebas contra `UsersStub` HTTP real (no mocks de `fetch`). | Verificar rutas, propagación y mapeo de errores/respuestas extrañas. |

El adapter implementa solo el subconjunto de registro del puerto; `resolveLoginIdentity` queda para
AUTH-063 y la composición bajo `USERS_SERVICE` para AUTH-072/AUTH-046. No se añadió un segundo transporte.

## Comportamiento verificado (12/12 GREEN)

- **create:** POST `/internal/v1/registrations` con `registrationId/userId/name/email/role`; propaga bearer
  de servicio, `Idempotency-Key = registrationId` y `traceId`; repetición devuelve la misma identidad.
  El body nunca incluye `password`/hash/tokens.
- **get:** GET por `registrationId`; `404 → null`.
- **activate:** POST `/activate`; `409 → RegistrationCancelledError`.
- **cancel:** POST `/cancel`; `409 → RegistrationConflictError` (distinguible para reconsultar en la saga).
- **Errores:** `409` de create → `RegistrationConflictError`; `5xx`/timeout/circuito/401/403 →
  `DependencyUnavailableError('users')`.
- **Validación runtime:** `id` UUID, `name`/`email` no vacíos, `role`/`status` en allowlist, y coincidencia
  con el `userId` esperado en create; cualquier respuesta extraña → `DependencyUnavailableError`.

## Evidencia de comandos

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 25 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --runTestsByPath test/contract/users-registration-adapter.spec.ts
# PASS — 12/12
```

## Criterios de aceptación

- [x] El payload hacia Users contiene solo campos de `PendingUserCommand`.
- [x] Errores y respuestas extrañas no avanzan la saga (se traducen a errores seguros).
- [x] El GET candidato queda identificado como contrato candidato (PRE-004); los tests locales pasan.

## Pendiente / handoff

- **AUTH-076/AUTH-079:** aceptación de G2 del `GET /internal/v1/registrations/{id}` y `UserSummary`; el éxito
  local no acredita al proveedor real.
- **AUTH-063:** `resolveLoginIdentity`; **AUTH-072/AUTH-046:** composición bajo `USERS_SERVICE`.
- Sin bloqueos de infraestructura.
