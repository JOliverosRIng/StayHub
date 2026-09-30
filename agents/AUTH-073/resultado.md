# AUTH-073 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-072 y AUTH-047 (implementadas localmente). Reglas aplicadas: D01, D02, D04–D06,
D08–D10.

## Objetivo

Sincronizar el contrato OpenAPI de sesión (login/refresh/validate) entre el Swagger generado y el YAML
estático: 400 de validación, límites exactos del refresh, respuesta `InternalTokenPair` legible y cierre de
schemas, sin alterar rutas ni el contrato G1/G2.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `specs/.../openapi-auth-service.yaml` | `400` en login/refresh/validate; `minLength: 32` y descripción del `refreshToken`; descripciones de normalización en `LoginCommand`. | D02: errores de forma observables y límites coherentes con el DTO. |
| `src/interfaces/http/dto/login.dto.ts` | `@ApiSchema` `SessionPrincipal` e `InternalTokenPair`. | Nombres de schema estables y comparables con el YAML. |
| `src/interfaces/http/dto/validate-session.dto.ts` | `@ApiSchema` `ValidateSessionCommand` y `SessionValidation`. | Requests/respuestas con nombre estable. |
| `src/interfaces/openapi/openapi.factory.ts` | `closeContractSchemas` cierra `RegisterCommand`, `LoginCommand`, `RotateRefreshCommand`, `ValidateSessionCommand` e `InternalTokenPair` con `additionalProperties: false`. | El contrato exige requests/respuestas cerrados. |

No se modificó `openapi-public.yaml` ni el contrato de Users/Gateway. Las cuatro rutas internas siguen siendo
POST con `serviceAuth`; `validate` no pasa a GET. La sintaxis del script `openapi:check` se conserva (el
reemplazo ampliado es AUTH-075).

## Comportamiento verificado

- YAML 3.0.3 con las cuatro operaciones internas + health; `login` documenta `400/401/429 con Retry-After/503`,
  `refresh` y `validate` documentan `400/401/503`.
- `InternalTokenPair` con tokens legibles (sin `writeOnly`), `expiresIn` integer enum 3600, `absoluteExpiresAt`
  `date-time` y `principal` (`userId`/`sessionId`/`role`); validación con `{active:true, role}` y allowlist de rol.
- El Swagger generado por los controladores reales usa los mismos nombres y cierra los schemas; los DTO con
  campos desconocidos, límites y ausencia de cookie ya se validan en las suites de contrato de AUTH-049/050/051.

## Evidencia de comandos

```sh
npm run openapi:check   # OK (3.0.3 + 4 rutas)
npm run typecheck       # OK
npm run lint            # OK
npm run test:contract   # 6 suites, 131 tests, 0 fallos
npm run test:unit       # 16 suites, 137 tests
```

## Criterios de aceptación

- [x] Contrato estático y generado describen el comportamiento ya ejecutado (400/401/429/503, límites y shape).
- [x] No se modifica el contrato de G1/G2 (solo Auth y su YAML interno).

## Pendiente / handoff

- **AUTH-075:** comparación exhaustiva Swagger generado vs YAML por estructura (nombres/rutas/respuestas).
- **AUTH-074:** cierre de la verificación US2.
- Sin bloqueos de infraestructura.
