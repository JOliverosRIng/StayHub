# AUTH-045 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: AUTH-026, AUTH-042, AUTH-043 (ejecutadas). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Exponer el controlador HTTP interno de registro con guard/pipe reales, normalización acordada y
documentación Swagger, y convertir en GREEN la matriz de contrato de AUTH-026.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/interfaces/http/registration.controller.ts` | **Nuevo.** `RegistrationController` (`@Post` `/internal/v1/registrations`, 201, `ServiceAuthGuard`), `IdempotencyKeyPipe` dedicado y decoradores Swagger (`operationId: orchestrateRegistration`, `serviceAuth`, header, 201/400/401/409/503). | No existía el controlador; inyecta `REGISTER_ACCOUNT_USE_CASE` y devuelve solo `id/name/email/role`. |
| `apps/auth-service/src/interfaces/http/dto/register.request.ts` | `@Transform` de `trim` en `name` y `email` (protegido por `typeof string`). | H10: el correo con espacios fallaba antes de normalizar; la contraseña no se transforma. |
| `apps/auth-service/test/contract/registration.contract.spec.ts` | Se elimina el controlador fixture y el test 404 RED; la suite usa el `RegistrationController` real. | Cerrar la matriz en GREEN. |

`problem.mapper.ts` no requirió cambios (ya traduce conflictos a 409 y `DependencyUnavailableError` a 503).
El `IdempotencyKeyPipe` se ejecuta programáticamente porque el decorador `@Headers` de Nest no acepta pipes.

## Cobertura (30/30 GREEN)

- 201 para `GUEST`/`OWNER` con solo `id/name/email/role`; el caso de uso recibe la misma `Idempotency-Key` y
  el `traceId`.
- Normalización: `name`/`email` con espacios exteriores se recortan; `name` vacío tras `trim` → 400;
  contraseña exacta (8/128 y Unicode).
- 12 casos 400 (`VALIDATION_FAILED`), 6 casos 401 (bearer ausente, clave foránea, issuer/audience/scope,
  vencido) sin ejecutar el caso de uso.
- 409 (`IDEMPOTENCY_CONFLICT`/`REGISTRATION_CONFLICT`/`REGISTRATION_CANCELLED`) y 503
  (`DEPENDENCY_UNAVAILABLE`) con `application/problem+json`, `traceId` coherente y sin PII.

## Evidencia de comandos

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 8 suites, 36 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects security   # OK — 5 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --runTestsByPath test/contract/registration.contract.spec.ts
# PASS — 30/30

# Integración: 5 suites, 45 tests — sin regresiones.
```

## Criterios de aceptación

- [x] El endpoint sirve 201 y todos los errores contractuales con guard/pipe reales.
- [x] Correo/nombre con espacios exteriores funcionan; la contraseña sigue exacta.
- [x] El controlador solo traduce HTTP y ejecuta el caso de uso.

## Pendiente / handoff

- **AUTH-046:** componer `RegistrationController` en el módulo de registro.
- **AUTH-047:** sincronizar OpenAPI (`serviceAuth`, Problem, respuestas) con el YAML.
- Sin bloqueos de infraestructura.
