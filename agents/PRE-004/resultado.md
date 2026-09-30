# PRE-004 — Resultado de ejecución

Fecha: 2026-09-28. Base: commit `393a80d`. Estado: **Verificado localmente**; la aceptación externa (G2/G1) queda **bloqueada**, por diseño del plan.

PRE-004 fija tipos y contratos candidatos. No cambia servicios de otros equipos ni el contrato público.

## Cambios realizados

| Archivo | Cambio |
|---|---|
| `apps/auth-service/src/application/ports/users-service.port.ts` | Se separa `RegistrationIdentity` (`userId,name,email,role,status`) de `LoginIdentity` (`userId,role,status:'ACTIVE'`). Se ajustan las firmas `createPendingUser`/`getRegistration`/`activateRegistration` a `RegistrationIdentity`; `cancelRegistration` sigue devolviendo `void`. Se elimina `UserIdentitySummary`. |
| `apps/auth-service/src/application/ports/auth-use-cases.port.ts` | **Nuevo.** Tipos de aplicación puros (sin decoradores ni framework) y símbolos de inyección para los cuatro casos de uso: `RegisterAccountUseCase`, `LoginUseCase`, `RotateRefreshTokenUseCase`, `ValidateSessionUseCase`. |
| `apps/auth-service/src/application/ports/index.ts` | Exporta `auth-use-cases.port`. |
| `apps/auth-service/src/application/errors/auth-errors.ts` | Añade `RegistrationConflictError` (`REGISTRATION_CONFLICT`) y `RegistrationCancelledError` (`REGISTRATION_CANCELLED`); conserva `IdempotencyConflictError`. |
| `apps/auth-service/src/interfaces/http/problem.mapper.ts` | Mapea ambos errores de registro a HTTP 409. |
| `agents/contrato-users-candidato.md` | **Nuevo.** Propuesta para G2 del GET de registro, `UserSummary`, errores, mapping `id`→`userId`, normalización, introspección sin `exp` y `GATEWAY_BASE_URL`. |

## Contratos de aplicación definidos

- `RegisterAccountUseCase.execute({ idempotencyKey, input:{name,email,password,role}, traceId })` → `{ id, name, email, role }` (compatible con `UserSummary` de Auth: `id/name/email/role`).
- `LoginUseCase.execute({ email, password, traceId })` → `IssuedTokenPair { accessToken, refreshToken, expiresIn:3600, absoluteExpiresAt:Date, principal:{userId,sessionId,role} }` (compatible con `InternalTokenPair`).
- `RotateRefreshTokenUseCase.execute({ refreshToken, traceId })` → `IssuedTokenPair`.
- `ValidateSessionUseCase.execute({ sessionId, userId, accessTokenExpiresAt?, traceId })` → `{ active:true, role }` (compatible con `/sessions/validate`).

`role` de registro se tipa `Exclude<UserRole,'ADMIN'>`; `IssuedTokenPair.expiresIn` es el literal `3600`; `absoluteExpiresAt` es `Date` (se serializa a `date-time`).

## Mapping `id`→`userId`

Documentado en `agents/contrato-users-candidato.md` §2: `UserSummary.id` → `RegistrationIdentity.userId`, conservando `name`/`email` solo en memoria para la respuesta pública. No se persiste información personal nueva en `auth_db`.

## Excepciones y normalización (documentadas, no implementadas aquí)

- `name`/`email` son parte deliberada de la respuesta de registro; los tokens son parte deliberada de login/refresh exitosos.
- Normalización antes de validar y calcular fingerprint: `name` trim; `email` trim+lowercase; `password` exacta (8–128 puntos de código). El ajuste de DTO corresponde a AUTH-026/044/049/071/073.
- El contrato interno de validación no recibe `exp`: ese camino **no** cachea resultados positivos (D06).
- Gateway: `GATEWAY_BASE_URL` configurable hasta acuerdo G1 (8443 vs 8080); no se edita `openapi-public.yaml`.

## Evidencia

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test:unit   # OK — 6 suites, 25 tests
npm run build       # OK — dist/apps/auth-service/main.js
```

## Criterios de aceptación

- [x] Los cuatro `execute` tienen entradas/salidas explícitas compatibles con OpenAPI Auth.
- [x] Hay mapping explícito `id`→`userId` sin pérdida del resumen de registro.
- [x] La ruta GET faltante y la aceptación externa pendiente están visibles; no se atribuye implementación a G2.

## Bloqueos externos

- **Aceptación de G2**: que la propuesta `GET /internal/v1/registrations/{registrationId}` y `UserSummary` se incorporen al contrato real de Users. No bloquea el desarrollo local contra el stub candidato (AUTH-041), pero AUTH-076/AUTH-079 no se cierran sin ella.
- **Acuerdo G1**: puerto público del Gateway (8443 en el contrato vs 8080 del plan). Se resuelve en AUTH-078/AUTH-081.

## Notas de alcance

- No se modificaron `openapi-users-service.yaml`, `openapi-auth-service.yaml` ni `openapi-public.yaml`.
- No se implementaron login, registro ni endpoints de otros servicios.
