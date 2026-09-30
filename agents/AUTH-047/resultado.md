# AUTH-047 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: AUTH-046 (ejecutada). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Sincronizar el contrato OpenAPI de registro entre Swagger generado y el YAML: nombres de schemas estables,
respuestas 201/400/401/409/503, `Problem` con `instance`/`errors`, request cerrado y documentación de la
normalización.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/interfaces/http/dto/problem.response.ts` | **Nuevo.** `ProblemResponse` con `type/title/status/detail/instance/code/traceId` y `errors` opcional; `@ApiSchema({ name: 'Problem' })`. | El YAML ya referenciaba `Problem`; faltaba el DTO generado. |
| `apps/auth-service/src/interfaces/http/dto/register.request.ts` | `@ApiSchema({ name: 'RegisterCommand' })` y descripciones de `trim`/lowercase/password exacta. | Estabilizar el nombre y documentar normalización. |
| `apps/auth-service/src/interfaces/http/dto/register.response.ts` | `@ApiSchema({ name: 'UserSummary' })`; enum de `role` ampliado a `GUEST/OWNER/ADMIN`. | Compatibilidad con el `Role` del contrato. |
| `apps/auth-service/src/interfaces/http/registration.controller.ts` | `@ApiExtraModels(ProblemResponse)`, respuestas de error con `application/problem+json` y **401** añadido. | Alinear con el YAML. |
| `apps/auth-service/src/interfaces/openapi/openapi.factory.ts` | `closeRequestSchemas` fija `additionalProperties: false` en `RegisterCommand`/`LoginCommand` del documento generado. | No confiar en el whitelist para documentar el cierre. |
| `specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml` | 401 en registro; `Problem` con `instance`/`errors`; descripciones de `name`/`email`. | Sincronización con Swagger. |
| `apps/auth-service/test/unit/openapi.factory.spec.ts` | **Nuevo.** 2 pruebas que generan el documento real y validan operación, respuestas, security, header y schemas. | Evidencia de la sincronización. |

No se alteraron rutas públicas (`openapi-public.yaml` intacto). La respuesta 201 solo documenta
`id/name/email/role`; no se exponen contraseñas, hashes ni tokens.

## Comportamiento verificado (2/2 GREEN)

- `orchestrateRegistration` con `security: [{ serviceAuth: [] }]`, header `Idempotency-Key` y respuestas
  `201/400/401/409/503`.
- Schemas generados: `RegisterCommand` con `additionalProperties: false` y `required` completo,
  `Problem` con `instance`/`errors`, y `UserSummary` referenciado por el 201.

## Evidencia de comandos

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run openapi:check                                 # OK (YAML 3.0.3 + 4 rutas)
npm run test:unit --workspace @stayhub/auth-service   # OK — 9 suites, 38 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects contract   # OK — 2 suites, 42 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects security   # OK — 5 tests

TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration
# OK — 6 suites, 48 tests
```

## Criterios de aceptación

- [x] Swagger y YAML describen los mismos campos, límites y respuestas `201/400/401/409/503`.
- [x] Cambios limitados al contrato Auth; no se tocan rutas públicas.
- [x] La respuesta solo documenta `id/name/email/role` (name/email permitidos por el contrato).

## Pendiente / handoff

- **AUTH-075:** comparación exhaustiva Swagger generado vs YAML (equivalencia estructural de nombres/rutas).
- **AUTH-048:** cierre de US1.
- Sin bloqueos de infraestructura.
