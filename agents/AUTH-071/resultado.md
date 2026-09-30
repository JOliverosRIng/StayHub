# AUTH-071 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-049, AUTH-050, AUTH-051, AUTH-065, AUTH-067, AUTH-068 y AUTH-069 (todas ejecutadas).
Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Exponer por HTTP real las tres rutas internas de autenticación (`login`, `sessions/refresh`,
`sessions/validate`) con `ServiceAuthGuard`, casos de uso inyectados por token y respuesta explícita, sin
cookie ni perfil. Sustituye los controladores fixture de AUTH-049/050/051.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/interfaces/http/login.controller.ts` | **Nuevo.** `LoginController` (`POST /internal/v1/login`, 200, `ServiceAuthGuard`, operationId `login`): mapea el comando y devuelve `InternalTokenPairResponse`. | No existía la ruta productiva. |
| `src/interfaces/http/sessions.controller.ts` | **Nuevo.** `SessionsController` con `POST /internal/v1/sessions/refresh` (operationId `rotateRefreshToken`) y `POST /internal/v1/sessions/validate` (operationId `validateSession`), 200 y `ServiceAuthGuard`. | No existían las rutas de rotación/introspección. |
| `src/interfaces/http/dto/login.dto.ts` | `LoginRequest` gana `@ApiSchema({name:'LoginCommand'})` y `@Transform` trim de email; se quita `writeOnly` de `accessToken`/`refreshToken`; `expiresIn` tipado `integer` enum 3600. | H03/H10: trim antes de validar, tokens serializables y expiración entera. |
| `src/interfaces/http/dto/refresh.dto.ts` | `RefreshSessionRequest` con `@ApiSchema({name:'RotateRefreshCommand'})`, `writeOnly`, `minLength:32` documentado (body, sin cookie). | Contrato interno de rotación. |
| `src/interfaces/http/dto/problem.response.ts` | Nuevo helper `problemResponse(status, description, headers?)`. | Respuestas problem+json consistentes y `Retry-After` documentado en 429. |
| `test/contract/login.contract.spec.ts` | Usa `LoginController` real; se retira el fixture y el caso RED de ruta ausente; `trim` queda GREEN. | Verificar HTTP real. |
| `test/contract/refresh.contract.spec.ts` | Usa `SessionsController` real; retira fixture y RED de 404. | Verificar rotación. |
| `test/contract/session-validation.contract.spec.ts` | Usa `SessionsController` real; retira fixture y RED de 404. | Verificar introspección. |

No se registraron los controladores en `AppModule`: la composición corresponde a AUTH-072. Las cuatro rutas
internas mantienen `ServiceAuthGuard` (no el guard de usuario).

## Comportamiento verificado por contrato (HTTP real, 69 tests en las tres suites)

- `POST /internal/v1/login`: 200 con `InternalTokenPair` completo (tres roles), `expiresIn` entero 3600,
  UUIDs, sin `Set-Cookie`; reenvío exacto de email/password/traceId; email con espacios se recorta; 9 casos
  400 antes del caso de uso; 401 genérico idéntico; 429 `LOGIN_RATE_LIMITED` con `Retry-After` entero ≥1; 503
  de dependencia; 401 de service JWT (firma, issuer, audience, scope, vencido).
- `POST /internal/v1/sessions/refresh`: 200 con par rotado y sin cookie; 6 casos 400 + `cookie-only`; 401
  genérico (desconocido/vencido/consumido/revocado) sin exponer el raw; 503 de persistencia; 401 de service JWT.
- `POST /internal/v1/sessions/validate`: 200 con exactamente `{active:true, role}` para tres roles; 10 casos
  400 (UUID/`exp`/campos desconocidos); 401 genérico; 503 de BD; 401 de service JWT.
- Los errores se traducen por el filtro común (`application/problem+json` + `traceId`); ninguna respuesta
  incluye cookie ni perfil de usuario.

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run openapi:check   # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --testPathPattern='login.contract|refresh.contract|session-validation.contract'   # 3 suites, 69 tests

npm run test:unit       # 16 suites, 137 tests
npm run test:security   # 2 suites, 46 tests
npm run test:contract   # 6 suites, 131 tests, 0 RED
# Integración completa: 10 suites, 94 tests, 0 fallos
```

## Criterios de aceptación

- [x] Las tres rutas responden en HTTP real y no dependen de mocks del guard (`ServiceAuthGuard` real).
- [x] Los errores se traducen por el filtro común.
- [x] No aparece cookie ni perfil en el contrato interno.

## Pendiente / handoff

- **AUTH-072:** registrar `LoginController`/`SessionsController` y sus casos de uso (`LOGIN_USE_CASE`,
  `ROTATE_REFRESH_TOKEN_USE_CASE`, `VALIDATE_SESSION_USE_CASE`) junto con `LoginRateLimiterService`,
  `IssueSessionTokensService`, `HmacRefreshTokenCodec` y `PrismaSessionUnitOfWork`.
- **AUTH-073:** sincronizar el contrato OpenAPI de sesión con el Swagger generado.
- Sin bloqueos de infraestructura.
