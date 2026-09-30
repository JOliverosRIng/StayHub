# AUTH-074 — Resultado de ejecución (cierre US2)

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Verificado local (GREEN)**;
integraciones G1/G2 pendientes (bloqueo externo declarado).

Dependencias: AUTH-049–053, 055–058, 063–069, 071, 072 y 073 (todas ejecutadas). Reglas: D01–D10.

## Entorno y versiones

- Node **22.22.2**, npm **10.9.7** (`engines` piden >=20 <21; solo warnings).
- PostgreSQL **16-alpine** y Redis **7-alpine** de `infra/docker/auth/compose.test.yml` vía Podman (Docker no
  instalado).
- NestJS 10.4.22, Prisma 6.19.0, TypeScript 5.7.3, `@nestjs/passport` 10.0.3.
- Users stub HTTP candidato local (proveedor real G2 pendiente).

## Migraciones

Verificadas en bases desechables separadas del mismo PostgreSQL:

- **Base vacía → 001–004:** `prisma migrate deploy` aplicó `001_auth_registration`, `002_auth_sessions`,
  `003_registration_work`, `004_session_revocation`; `migrate status` = *Database schema is up to date!*.
- **Base con 001/002 → 003/004:** se aplicaron primero `001`/`002` (esquema temporal) y después `003`/`004`
  con el esquema real; estado al día.

Constraints/índices comprobados por SQL:

```
RefreshToken_one_active_per_session (índice parcial único)
RefreshToken_consumption_consistent, RefreshToken_expiry_after_issue
Registration_attemptCount_nonnegative, Registration_lease_consistent
Session_expiry_after_creation, Session_revoke_reason_consistent, Session_version_positive
```

## Batería local completa

Con PostgreSQL 16/Redis 7/stub Users:

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run openapi:check   # OK
npm run test:unit       # 17 suites, 139 tests
npm run test:contract   # 6 suites, 131 tests
npm run test:security   # 2 suites, 46 tests
npm run test:integration   # 11 suites, 98 tests
npm run test:coverage --workspace @stayhub/auth-service   # 36 suites, 414 tests, 0 fallos
```

Incluye emisión de tokens (`IssueSessionTokensService`), composición de módulos (`auth-modules.spec`),
concurrencia SQL (rotación/replay, `session-unit-of-work`, registro), rate limit con Redis real, guards
Passport/service JWT y recorrido register→login→validate→refresh→replay→401.

## Cobertura

Umbral global del repo (70) respetado; sin excluir controladores/adaptadores.

| Alcance | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| **Global (36 suites)** | **88.44%** | **73.87%** | **88.37%** | **89.7%** |
| **US2 afectado (27 archivos)** | **87.73%** | **75%** | **81.98%** | **88.26%** |

US2 agrega login/sesiones (application, ports, seguridad, adapter HTTP, repos/UoW de sesión, controladores,
strategy/guards y módulos). Se añadió `test/unit/users-service-adapter.spec.ts` para cubrir la delegación de
`USERS_SERVICE` (los adapters no se excluyen).

## Trazabilidad FR → pruebas

| FR/SC | Descripción breve | Pruebas representativas |
|---|---|---|
| FR-007 | Login con credenciales válidas | `auth-modules` (registro→login 200); `login.contract` (200 tres roles); `login-persistence` (tres roles) |
| FR-008 | 401 genérico sin revelar dato/cuenta | `login.contract` «identical problem missing/wrong/inactive»; `login.use-case` «does not authenticate unknown even if hasher true» |
| FR-009 | Sesión ligada a identidad y rol fijo | `validate-session.use-case`/`session-validation` (rol autoritativo); `rotate-refresh-token` (rol inmutable); guards «role claim ≠ session role» → 401 |
| FR-010 | Access 3600 s, refresh 7 días, rotación y replay | `issue-session-tokens` (exp 3600/7d); `refresh.contract`; `refresh-rotation`/`rotate-refresh-token` (replay revoca, no extiende expiry) |
| FR-011 | Autenticación antes de operar | `authentication-authorization` (guards orden access→roles); rutas internas con `ServiceAuthGuard` |
| FR-012 | 401 sin cambios parciales | contract/security 401; replay revoca en DB y devuelve 401 sin tokens |
| FR-013 | 403 por rol insuficiente | `authentication-authorization` «valid identity without required role → 403» |
| FR-024 | Contraseñas/refresh ocultos | `registration-secrets`; contract «never leaks password/refresh»; logs sin token |
| SC-002 | 100% caminos válidos | login/validate/refresh/registro verdes (contract + integración) |
| SC-003 | 100% inválidos denegados sin cambios | suites 400/401/429/503 y replay; sin inserciones en negativos |

### Evidencia RED→GREEN

- RED registrado antes de implementar en AUTH-049/050/051 (rutas ausentes y `trim`/`Retry-After`), AUTH-052
  (matriz de login), AUTH-055 (rotación), AUTH-056/057/058 (Redis, caché, guards) y AUTH-073 (400 de
  validación). Se conservan como históricos; todos GREEN tras sus implementaciones.
- Las suites preexistentes de la base (`registration-policy`, `registration-idempotency`, `registration-state`,
  `session`) no tienen registro del RED original: se declara **desconocido**.

## Política de caché positiva

La ruta HTTP `POST /internal/v1/sessions/validate` no transporta `exp`, por lo que **no escribe caché
positiva** (`ValidateSessionService` solo cachea con `accessTokenExpiresAt` confiable, con
`TTL = min(exp-now, absoluteExpiry-now)`). PostgreSQL es siempre autoritativo: ningún hit de Redis autoriza por
sí solo y una sesión revocada se rechaza de inmediato invalidando el hit obsoleto. Redis caído no impide la
validación; la BD caída es 503.

## Criterios de aceptación

- [x] Todas las suites locales GREEN; cobertura global y afectada ≥70%; typecheck/lint/build correctos.
- [x] El replay revoca con pruebas sobre PostgreSQL y el rate limit se recupera con Redis real.
- [x] No se declaran integraciones externas ejecutadas.

## Bloqueos externos declarados

- **G2 (users-service):** aceptación del contrato de registro/lookup (`GET /internal/v1/registrations/{id}`,
  `UserSummary`). El verde local usa el stub candidato y **no acredita** al proveedor real (AUTH-076/077/079/080).
- **G1 (gateway):** puerto y contrato de expectativas públicos; AUTH-078/081.
- **Docker:** no instalado; la imagen y el arranque en contenedor se verifican en AUTH-082.
- **Node 20:** no se probó la versión exacta del `engines` (se usó Node 22).
