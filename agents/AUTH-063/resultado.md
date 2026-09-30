# AUTH-063 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: PRE-001 y PRE-004 (verificadas localmente). Reglas aplicadas: D01, D02, D04–D07, D08–D10.

## Objetivo

Implementar el lookup de identidad de login contra el contrato Users
`POST /internal/v1/login-identities/resolve`, sin recuperar perfil ni acceder a `users_db`.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/infrastructure/http/users-login-identity.client.ts` | **Nuevo**. `UsersLoginIdentityClient.resolveLoginIdentity(normalizedEmail, traceId)` sobre `UsersServiceClient`. | No existía el adapter; el contrato y `LoginIdentity` ya estaban definidos en PRE-004. |
| `apps/auth-service/test/contract/users-login-identity-adapter.spec.ts` | **Nuevo**. 20 pruebas contra `UsersStub` HTTP real y un servidor raw controlado. | Shape, errores, contrato estricto y falta de caché. |

`users-service.port.ts` ya declaraba `resolveLoginIdentity`; no requirió cambios. No se cableó el adapter en
ningún módulo (corresponde a AUTH-072).

## Comportamiento

- **Petición:** `POST /internal/v1/login-identities/resolve` con body `{ email }` normalizado
  (`trim`+`lowercase`), service JWT, `x-trace-id` y `idempotent:true` (reintento solo en 5xx). Sin
  `Idempotency-Key`.
- **Respuesta 200:** se validan en runtime `userId` UUID, `role` en allowlist y `status === 'ACTIVE'`; se
  devuelven **solo** `{userId, role, status:'ACTIVE'}`, descartando `name`/`email`/`profile` aunque el
  proveedor los añada.
- **404:** único caso que devuelve `null` (identidad no encontrada). Un 200 con `PENDING`/`CANCELLED` o con
  datos inválidos **viola el contrato** → `DependencyUnavailableError`.
- **Errores:** timeout, circuito abierto, 5xx, 401/403 remotos y JSON inválido → `DependencyUnavailableError`
  (503). Nunca se traduce a `InvalidCredentialsError`.
- **Sin caché ni PII:** cada llamada consulta al proveedor; el adapter no persiste ni registra el correo.

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --runTestsByPath test/contract/users-login-identity-adapter.spec.ts   # 20/20
```

Proyecto de contrato: **134 tests: 132 pasan, 2 fallan RED esperado** (los dos RED documentados de
`login.contract.spec.ts` en AUTH-049, pendientes de AUTH-071/064). Sin regresiones nuevas.

## Criterios de aceptación

- [x] Solo el 404 equivale a identidad no encontrada.
- [x] El lookup no recupera perfil ni accede a `users_db` (solo `userId`/`role`/`status`).

## Pendiente / handoff

- **AUTH-072:** registrar `UsersLoginIdentityClient`/el adapter `USERS_SERVICE` en composición.
- **AUTH-065:** consumir `resolveLoginIdentity` desde `LoginUseCase` (la normalización de email se comparte).
- **AUTH-077:** verificar el contrato real de lookup de Users (aquí se usa el stub candidato).
- Sin bloqueos de infraestructura.
