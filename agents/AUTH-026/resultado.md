# AUTH-026 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (RED)**.

Dependencias leídas: PRE-001, PRE-004 (ambas verificadas localmente). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Preparar la suite de contrato HTTP de registro (`POST /internal/v1/registrations`) antes de que exista
`RegistrationController` (AUTH-045), dejando evidencia RED de conducta ausente y GREEN contra el fixture.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/contract/registration.contract.spec.ts` | **Nuevo**. Suite de contrato con controlador fixture test-local, stub tipado de `REGISTER_ACCOUNT_USE_CASE`, service JWT reales y configuración HTTP real. | No existe aún el controlador productivo; el fixture sostiene la matriz y se sustituye por el controlador real en AUTH-045. |

No se modificó código productivo. El fixture vive solo en `test/` y está rotulado como tal.

## Cobertura de la matriz

- **Happy path:** 201 para `GUEST` y `OWNER`; cuerpo con solo `id/name/email/role`; el stub recibe la misma
  `Idempotency-Key` UUID y el `traceId` del request.
- **Password exacta:** 8 y 128 puntos de código transmitidos sin cambios; contraseña con espacios y Unicode
  (`p ässw🔒8`) transmitida exacta.
- **400 (12 casos):** key ausente/no-UUID; nombre vacío/1/101; email inválido/>254; password 7/129;
  rol `ADMIN`; campo desconocido; email `null`. El rechazo no invoca el caso de uso.
- **401 (6 casos):** sin bearer; firma con clave foránea (mismo `kid`); issuer/audience/scope incorrectos;
  token vencido. El rechazo no invoca el caso de uso.
- **409/503:** `IdempotencyConflictError`, `RegistrationConflictError`, `RegistrationCancelledError` → 409;
  `DependencyUnavailableError` → 503. Se verifica `application/problem+json`, `traceId` coherente con
  `x-trace-id` y ausencia de password/PII en la respuesta.
- **RED de ruta ausente:** contra la composición de producción (sin el fixture) `POST` devuelve 404.

## Evidencia de comandos

Ejecutado desde la raíz del monorepo:

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --runTestsByPath test/contract/registration.contract.spec.ts
```

Resultado de la suite: **1 suite, 31 tests: 29 pasan, 2 fallan (RED esperado)**.

### RED esperado (conducta ausente, no importación/entorno)

1. `trims outer spaces of name and email before calling the use case` → esperado `201`, recibido `400`.
   Porque `RegisterRequest` aún no aplica `@Transform` de `trim` y `@IsEmail` rechaza el correo con espacios.
2. `rejects a name that is empty after trimming` → esperado `400`, recibido `201`.
   Porque `name: '   '` supera `@MinLength(2)` sin recortar y llega al caso de uso.

Ambos se volverán GREEN cuando AUTH-045 añada la normalización `trim(name)`/`trim(email)` en el DTO y el
controlador productivo.

### Nota sobre el password con Unicode

`class-validator`/`validator.js` cuentan puntos de código (restan pares sustitutos), por lo que
`p äss🔒8` es 7 puntos de código y se rechaza; se usó `p ässw🔒8` (8 puntos) para el caso válido.

## Criterios de aceptación

- [x] La matriz prueba ambos roles y límites exactos sin modificar la contraseña (fixture y stub).
- [x] Los rechazos del guard y del pipe no ejecutan negocio (`execute` no llamado).
- [x] Se conserva evidencia RED; queda pendiente el GREEN al conectar AUTH-045.

## Pendiente / handoff

- **AUTH-045:** reemplazar `RegistrationControllerFixture` (en el spec) por el `RegistrationController`
  productivo con `@Transform` de `trim`; eliminar el test RED de ruta ausente y re-ejecutar la suite para GREEN.
- **AUTH-033:** los casos de respuesta (`409/503`, `traceId`, sin PII) se conservan para las pruebas de
  secretos cuando exista la saga real.
- Sin bloqueos de infraestructura: la suite es de contrato y no requiere PostgreSQL/Redis.
