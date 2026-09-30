# AUTH-048 — Resultado de ejecución (cierre US1)

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service` (árbol de trabajo sin commitear,
68 rutas). Estado: **Verificado local (GREEN)**; validación G2 pendiente (bloqueo externo declarado).

Dependencias: AUTH-026, 030, 031, 032, 033, 040, 041, 042, 043, 045, 046, 047 (todas ejecutadas). Reglas:
D01–D03, D07–D10.

## Entorno y versiones

- Node **22.22.2**, npm **10.9.7** (los `engines` piden >=20 <21; sin fallos, sólo warnings).
- PostgreSQL **16-alpine** y Redis **7-alpine** de `infra/docker/auth/compose.test.yml` vía Podman
  (Docker no instalado).
- NestJS 10.4.22, Prisma 6.19.0, TypeScript 5.7.3.
- Users stub HTTP candidato local (sin proveedor real G2).

## Migraciones

`prisma migrate deploy` verificado en dos escenarios sobre base desechable:

- **Desde base vacía:** aplicó `001_auth_registration` y `002_auth_sessions` (conteniendo 003/004 fuera).
- **Desde 001/002:** aplicó `003_registration_work` y `004_session_revocation`.
- `prisma migrate status`: *Database schema is up to date!* (las 4 migraciones).

## Comandos y resultados

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run openapi:check                                 # OK

# US1 por proyecto
npm run test:unit --workspace @stayhub/auth-service                          # 9 suites, 38 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects contract  # 2 suites, 42 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects security  # 1 suite,  5 tests
TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
  npm run test --workspace @stayhub/auth-service -- --selectProjects integration  # 6 suites, 48 tests

# Filtro de registro (unit+integration+contract+security) — 12 suites, 110 tests, 0 omitidos
npm run test --workspace @stayhub/auth-service -- \
  --selectProjects unit integration contract security --testPathPattern=registration
```

Sin `test.skip`, `todo` ni `--passWithNoTests`: los 133 tests de US1 (más los relacionados) están activos.

### Cobertura afectada de US1

`jest --coverage` con `--collectCoverageFrom` restringido a los módulos de registro/credenciales
(`--coverageThreshold` global puesto a 0 **sólo para esta medición**; el umbral del repo sigue en 70):

| Grupo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| **Total US1** | **86.97%** | **72.41%** | **90.62%** | **89.4%** |
| application/registration | 86.56 | 70.93 | 94.28 | 90.51 |
| domain/registrations | 82.22 | 68 | 93.75 | 81.81 |
| infrastructure/http (adapter) | 92.98 | 87.87 | 100 | 98.03 |
| interfaces/http (controller + DTO) | 100 | 100 | 100 | 100 |
| modules/registration + credentials | 96.22/100 | 100 | 90/100 | 95.83/100 |

Todos los agregados ≥70%. El umbral **global** del repo (que incluye sesiones/login aún sin implementar)
se mantiene intacto.

## Trazabilidad FR → pruebas

| FR | Descripción breve | Pruebas representativas |
|---|---|---|
| FR-001 | Registro público nombre/correo/contraseña/rol GUEST-OWNER | contract «returns 201 … for GUEST/OWNER»; saga «completes the saga…»; module «serves a registration end-to-end»; unit «runs the D03 order…» |
| FR-002 | Roles exactos GUEST/OWNER/ADMIN | contract 400 «rejects ADMIN role»; openapi «stabilises schema names…» (enum UserSummary); adapter/unit `toRegistrationRole` |
| FR-003 | Validación de presencia/formato; contraseña 8–128 exacta | contract 400 (empty/1/101 name, email inválido/>254, password 7/129) y «transmits a 8/128 code point password exactly»; unit `registration-policy.spec` |
| FR-004 | `trim` exterior y correo case-insensitive único | contract «trims outer spaces…», «rejects a name that is empty after trimming»; saga «rejects a second key with an equivalent email»; adapter «maps an email conflict» |
| FR-005 | Operación única; éxito sólo con usuario+rol+credencial activos | saga «completes… User ACTIVE, Credential ACTIVE»; «does not leave a partially authenticable identity»; unit «does not complete when Users does not confirm ACTIVE»; unit `registration-state.spec` |
| FR-006 | Reintentos no duplican cuentas | contract «forwards the request traceId and the idempotency key»; unit «returns the same id on repetition»; concurrency «creates exactly one row…»; saga «returns the same identity on repetition» |
| FR-024 | Contraseñas/refresh tokens ocultos en respuestas y errores | security «does not leak synthetic secrets…», «keeps allowed correlation fields…», «does not forward the raw error message…»; contract 201 sólo `id/name/email/role` |

### Evidencia RED→GREEN

- **RED registrado antes de implementar:** AUTH-026 dejó 2 fallos de conducta por falta de `trim`
  (GREEN en AUTH-045); AUTH-030/031/032/033 prepararon suites antes de la implementación; el 404 de ruta
  ausente se eliminó al conectar AUTH-045.
- **Sin evidencia histórica:** para las suites que ya existían en la base (`registration-policy`,
  `registration-idempotency`, `registration-state`, `session`) no hay registro del RED original; se declara
  **desconocido**.

## Resultados de concurrencia, caída y reconciliación

- **Concurrencia (AUTH-030):** 7/7 — una fila con creación simultánea, ganador estable, credencial intacta,
  reclamo exclusivo, lease vencido, lotes disjuntos y estado terminal.
- **Caída/recuperación (AUTH-042):** 12/12 — reanudación desde cada estado, 503 con checkpoint y lease
  liberado, timeout tras create/activate sin cancelar un User `ACTIVE`, 409 de key/correo.
- **Reconciliación (AUTH-043):** 10/10 — ambos ACTIVE tras TTL, espera sin contar intentos + compensación
  tras TTL, CANCELLED remoto, COMPENSATING persistente, 409/ACTIVE, backoff 30/60/120/240 y dos workers
  disjuntos; scheduler se detiene limpiamente.

## Criterios de aceptación

- [x] Unit/contract/integration/security de US1 GREEN, sin tests omitidos (133 tests; 110 en el filtro de
  registro).
- [x] Cobertura afectada ≥70% con ramas/funciones/líneas/sentencias registradas (86.97/72.41/90.62/89.4).
- [x] Queda declarada la dependencia externa del GET candidato.

## Bloqueo externo declarado

- **G2 (users-service):** aceptar `GET /internal/v1/registrations/{registrationId}` y `UserSummary`
  (candidato en `agents/contrato-users-candidato.md`). El verde local usa el stub candidato y **no acredita**
  al proveedor real; se cierra en AUTH-076/AUTH-079.
- **Docker:** ausente; la verificación usa Podman con el mismo compose. La imagen no se construyó (AUTH-082).
- **Node 20:** no se probó con la versión exacta del `engines` (se usó Node 22).
