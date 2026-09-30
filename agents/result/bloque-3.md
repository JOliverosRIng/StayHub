# Bloque 3 — Login, tokens y sesiones (resultados consolidados)

Fecha: 2026-09-29. Base: commit `393a80d` (rama `Auth_Service`), trabajo sin commitear.
Fuente de detalle: `agents/<ID>/resultado.md` de cada plan. Memoria general: [`README.md`](README.md).

Estado del bloque: **COMPLETO**. Los 20 planes del bloque (AUTH-049…074, según el orden de `agents/README.md`)
están **implementados/verificados localmente**, con `AUTH-074` como cierre de la historia US2.

## Planes ejecutados

| Orden | ID | Tipo | Estado | Resultado |
|---|---|---|---|---|
| 18 | AUTH-049 | Pruebas HTTP login | Verificado local (GREEN) | [resultado](../AUTH-049/resultado.md) |
| 19 | AUTH-050 | Pruebas HTTP refresh | Verificado local (GREEN) | [resultado](../AUTH-050/resultado.md) |
| 20 | AUTH-051 | Pruebas HTTP introspección | Verificado local (GREEN) | [resultado](../AUTH-051/resultado.md) |
| 21 | AUTH-052 | Unitarias LoginUseCase (referencia) | Verificado local (GREEN) | [resultado](../AUTH-052/resultado.md) |
| 22 | AUTH-053 | Verificación access JWT | Implementado local (GREEN) | [resultado](../AUTH-053/resultado.md) |
| 23 | AUTH-055 | Rotación/replay/concurrencia (referencia) | Verificado local (GREEN) | [resultado](../AUTH-055/resultado.md) |
| 24 | AUTH-056 | Rate limit Redis (referencia) | Verificado local (GREEN) | [resultado](../AUTH-056/resultado.md) |
| 25 | AUTH-057 | Validación y caché de sesión (referencia) | Verificado local (GREEN) | [resultado](../AUTH-057/resultado.md) |
| 26 | AUTH-058 | Guards, roles y service JWT (referencia) | Verificado local (GREEN) | [resultado](../AUTH-058/resultado.md) |
| 27 | AUTH-063 | Lookup de identidad para login | Implementado local (GREEN) | [resultado](../AUTH-063/resultado.md) |
| 28 | AUTH-064 | Rate limiter y Retry-After | Implementado local (GREEN) | [resultado](../AUTH-064/resultado.md) |
| 29 | AUTH-066 | Preparar y firmar pares de tokens | Implementado local (GREEN) | [resultado](../AUTH-066/resultado.md) |
| 30 | AUTH-065 | Login y creación atómica de sesión | Implementado local (GREEN) | [resultado](../AUTH-065/resultado.md) |
| 31 | AUTH-067 | Rotación y revocación por replay | Implementado local (GREEN) | [resultado](../AUTH-067/resultado.md) |
| 32 | AUTH-068 | Introspección autoritativa | Implementado local (GREEN) | [resultado](../AUTH-068/resultado.md) |
| 33 | AUTH-069 | Passport y guards de usuario | Implementado local (GREEN) | [resultado](../AUTH-069/resultado.md) |
| 34 | AUTH-071 | Controladores HTTP login/refresh/validate | Implementado local (GREEN) | [resultado](../AUTH-071/resultado.md) |
| 35 | AUTH-072 | Composición de módulos y adapters | Implementado local (GREEN) | [resultado](../AUTH-072/resultado.md) |
| 36 | AUTH-073 | Sincronizar contratos de sesión | Implementado local (GREEN) | [resultado](../AUTH-073/resultado.md) |
| 37 | AUTH-074 | Cierre verificación US2 | Verificado local (GREEN) | [resultado](../AUTH-074/resultado.md) |

## Resumen por plan

- **AUTH-049/050/051** — suites de contrato HTTP (fixtures) para login/refresh/introspección; cubren 200, 400,
  401 genérico, 429+`Retry-After`, 503 y service JWT. Pasan a controladores reales en AUTH-071.
- **AUTH-052** — matriz unitaria de `LoginUseCase` (éxito tres roles, negativos, normalización, rate limit,
  fail-closed) con dobles; sustituida por `LoginService` en AUTH-065.
- **AUTH-053** — `verifyAccessToken` valida UUID, rol, `iat`/`exp` numéricos, `exp-iat=3600` y `kid` propio;
  `VerifiedAccessTokenClaims` con `iat`/`exp`.
- **AUTH-055/056/057/058** — referencias sobre PostgreSQL/Redis reales para rotación/replay, rate limit, caché
  de sesión y guards; usadas como RED/GREEN hasta sus implementaciones.
- **AUTH-063** — `UsersLoginIdentityClient.resolveLoginIdentity` (contrato Users candidato) sin perfil ni
  caché; 404→`null`, fallos→503.
- **AUTH-064** — `LoginRateLimiterService` + Lua atómico (`INCR`+`PEXPIRE`+`PTTL`) en `AuthCacheAdapter`,
  secreto `AUTH_LOGIN_IDENTIFIER_HMAC_SECRET`, `Retry-After` en el filtro; fail-closed.
- **AUTH-066** — `RefreshTokenCodec`/`HmacRefreshTokenCodec` e `IssueSessionTokensService`
  (`issueNewSession`/`issueForSession`, 32 bytes base64url, HMAC 64, 7 días, access 3600).
- **AUTH-065** — `LoginService`: rate limit → Users → credencial ACTIVE/`verifyWithEquivalentCost` → sesión +
  primer refresh en UoW; 401 genérico, 503 fail-closed; elimina la referencia de AUTH-052.
- **AUTH-067** — `RotateRefreshTokenService`: locks sesión→token, replay `REFRESH_REUSE` confirmado + 401 fuera
  de la transacción, sucesor único, `incrementVersion`, invalidación de caché best-effort.
- **AUTH-068** — `ValidateSessionService`: PostgreSQL autoritativo, 401 genérico, 503 de BD, caché best-effort
  y TTL positivo `min(exp-now, absoluteExpiry-now)`.
- **AUTH-069** — Passport `access-jwt` (custom sobre `TokenSigner` + sesión autoritativa), `AccessTokenGuard`
  (401/503) y `RolesGuard` (401/403); dependencias fijadas con versión exacta.
- **AUTH-071** — `LoginController` y `SessionsController` reales (200, `ServiceAuthGuard`), DTOs con trim de
  email, tokens sin `writeOnly`, `expiresIn` entero 3600, 429 con `Retry-After`.
- **AUTH-072** — `TokensModule`, `SessionsModule` y `LoginModule`; `USERS_SERVICE` único
  (`UsersServiceAdapter`); `AppModule` como composición; recorrido register→login→validate→refresh→replay→401.
- **AUTH-073** — YAML sincronizado (400 en login/refresh/validate, `minLength:32`), nombres de schema estables
  y cierre de requests/respuestas.
- **AUTH-074** — cierre US2: migraciones `001–004` (limpia y upgrade), constraints, cobertura global/afectada,
  trazabilidad FR-007–013/024 y SC-002/003.

## Evidencia agregada (AUTH-074)

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run openapi:check   # OK
npm run test:unit         # 17 suites, 139 tests
npm run test:contract     # 6 suites, 131 tests
npm run test:security     # 2 suites, 46 tests
npm run test:integration  # 11 suites, 98 tests
npm run test:coverage --workspace @stayhub/auth-service   # 36 suites, 414 tests, 0 fallos
```

| Cobertura | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| Global (36 suites) | 88.44% | 73.87% | 88.37% | 89.7% |
| US2 afectado (27 archivos) | 87.73% | 75% | 81.98% | 88.26% |

Migraciones verificadas en bases separadas: limpia `001_auth_registration → 004_session_revocation` y upgrade
`001/002 → 003/004`. Restricciones confirmadas: `RefreshToken_one_active_per_session`,
`RefreshToken_consumption_consistent`, `RefreshToken_expiry_after_issue`, `Registration_lease_consistent`,
`Registration_attemptCount_nonnegative`, `Session_revoke_reason_consistent`, `Session_version_positive`,
`Session_expiry_after_creation`.

## Política de caché positiva

`POST /internal/v1/sessions/validate` no transporta `exp`, así que no escribe caché positiva; PostgreSQL es
siempre autoritativo, un hit de Redis nunca autoriza por sí solo, Redis caído no impide validar y la BD caída
es 503. La caché solo se usa como pista best-effort y se invalida al revocar por replay.

## Bloqueos externos declarados

- **G2 (users-service):** aceptación del contrato de registro/lookup (`GET /internal/v1/registrations/{id}`,
  `UserSummary`). El verde local usa el stub candidato y **no acredita** al proveedor real (AUTH-076/077/079/080).
- **G1 (gateway):** puerto y contrato de expectativas públicos (AUTH-078/081).
- **Docker:** no instalado; imagen y arranque en contenedor pendientes de AUTH-082.
- **Node 20:** no se probó la versión exacta del `engines` (se usó Node 22).

## Siguiente

Bloque 4 (Contratos, integración y cierre): **AUTH-075** (comparar Swagger generado vs contrato Auth) y, en
paralelo cuando falten proveedores, **AUTH-082/083**. AUTH-076–081 quedan pendientes de contratos/entornos
externos G1/G2. `AUTH-084` certifica el cierre completo con toda la evidencia.
