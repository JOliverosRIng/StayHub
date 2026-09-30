# Revalidación G2 — 2026-09-29

Fuente: constitución, descripción/Depends on/in path de tasks_userService.md y
OpenAPI Users. No se usa users-service-status.md ni commits como evidencia.
Rutas src/test/prisma relativas a apps/users-service salvo indicación expresa.
No hay extensions.yml. PostgreSQL 16 de pruebas confirmado activo en
127.0.0.1:55432 mediante docker ps y pg_isready; no apagarlo.

## Línea base A

Ejecutados desde apps/users-service: npm run lint (0), npm run typecheck (0),
npm test -- --coverage (0). 24/24 suites, 148/148 pruebas; 34,574 s.
coverage/users/coverage-summary.json: 2026-09-29T14:31:36.5957435Z.
Sentencias 96,29% (676/702), ramas 90,37% (216/239), funciones 95,23% (120/126),
líneas 98,05% (504/514). Logs ignorados .artifacts/revalidation-baseline-*.
Las suites citadas abajo se ejecutaron en esta línea base; se inspeccionaron
directamente sus assertions. El orden TDD histórico no es verificable.

## Estado final USR-001–070

CUMPLE significa comportamiento presente y evidencia de esta revalidación;
CORREGIDA identifica cobertura reforzada, no una modificación de producción.
Los commits documentales identifican la auditoría, no sustituyen su evidencia.
La corrida final J se registra al final. No se acredita TDD histórico.

| tarea | criterio | estado | evidencia archivo:línea | test/comando | commit |
|---|---|---|---|---|---|
| USR-001 | Workspace Users y comandos | CUMPLE | package.json:5-26 (raíz), package-lock.json:17-63, nest-cli.json:12 | línea base | 5f941ef |
| USR-002 | Capas/bootstrap 3002 | CUMPLE | src/main.ts:12-20; src/app.module.ts:10; infrastructure/config/users-config.ts:35 | http-adapters, config | 5f941ef |
| USR-003 | Strict/aliases | CUMPLE | tsconfig.base.json:6-23; tsconfig.json:2-8; tsconfig.build.json:4-7 | typecheck | 5f941ef |
| USR-004 | Cuatro proyectos y cobertura | CUMPLE | jest.config.ts:5-17; test/*/setup.ts:1-2 | línea base | 5f941ef |
| USR-005 | Config documentada | CUMPLE | .env.example:2-23; README.md:7-29 | config | 5f941ef |
| USR-006 | Prisma Users y migraciones | CUMPLE | prisma/schema.prisma:1-4,44-46; package.json:20-22 | migrations-health (deploy real) | 5f941ef |
| USR-007 | Imagen no root | CUMPLE | infra/docker/users/Dockerfile:1-30; .dockerignore:1-11 | Compose real: build, migrate 0, healthy, node, 3002 no publicado | e3287fa |
| USR-008 | Compose privado | CUMPLE | docker-compose.yml:1-68; secrets, volumen, internal y restart explícitos | Compose real: build, migrate 0, healthy, node, 3002 no publicado | e3287fa |
| USR-009 | Etapas CI | CUMPLE | .github/workflows/ci.yml:29-38: ci/generate/deploy/lint/types/unit/combined/build/drift/image | inspección; CI remota no ejecutada | 5f941ef |
| USR-010 | Config falla cerrada | CUMPLE | src/infrastructure/config/users-config.ts:12-42; config.module.ts:4 | config.spec.ts:14-22 exige cada variable, db ajena, puerto/tamaño | 5f941ef |
| USR-011 | Lifecycle/users_db | CUMPLE | src/infrastructure/persistence/prisma/prisma.service.ts:6-13; prisma.module.ts:4 | migrations-health | 5f941ef |
| USR-012 | Whitelist/Problem | CUMPLE | src/interfaces/http/validation.pipe.ts:4-7; problem.filter.ts:10-13; problem.mapper.ts:4-10 | http-adapters:34-47,69-87; secret-leakage:18-23 | 5f941ef |
| USR-013 | Logs sin PII y OTLP | CUMPLE | src/infrastructure/logging/users-logger.ts:6-17; observability/otel.ts:5-14; interfaces/http/trace.interceptor.ts:11-20 | secret-leakage:6-16; telemetry:5-12 export real local | 5f941ef |
| USR-014 | Service JWT y scopes | CUMPLE | src/interfaces/http/guards/service-auth.guard.ts:7-20; infrastructure/security/service-jwt.verifier.ts:6-11 | service-auth:18-22; shared verifier inspeccionado | 5f941ef |
| USR-015 | Bearer/claims canónicos | CUMPLE | src/interfaces/http/auth/jwt.strategy.ts:13-18; modules/users-auth.module.ts:5 | jwt-hardening; H4/H5 detectadas | 5f941ef |
| USR-016 | Puertos sin Prisma | CUMPLE | src/application/ports/user.repository.ts:1-12; profile.repository.ts:1-11; unit-of-work.ts:3 | typecheck y lectura directa | 5f941ef |
| USR-017 | Errores sin HTTP en dominio | CUMPLE | src/domain/shared/domain-error.ts:1-6; application/errors/users-errors.ts:1 | registration-policy/http-adapters | 5f941ef |
| USR-018 | Ready exige migraciones | CUMPLE | src/modules/health/health.controller.ts:7-10; prisma.service.ts:11-12 | migrations-health:7-11 invalida finished_at y espera 503 | 5f941ef |
| USR-019 | Swagger interno/UI dev | CUMPLE | src/interfaces/openapi/openapi.factory.ts:4-11; openapi.module.ts:1-3; main.ts:17 | http-adapters:94-96 | 5f941ef |
| USR-020 | Harness real aislado | CUMPLE | test/integration/postgres.setup.ts:16-43; fixtures/users.fixture.ts:4-18 | migrations-health:13-22; schema por suite, reset por prueba, helper rollback comprobado | 5f941ef |
| USR-021 | Integración global/3002 privado | CUMPLE | src/app.module.ts:10; main.ts:16-20; configure-http.ts:7-10; compose sin ports | Compose real: build, migrate 0, healthy, node, 3002 no publicado | e3287fa |
| USR-022 | HTTP registro y DTO cerrado | CUMPLE | test/contract/registration.contract.spec.ts:9-26 afirma proyección y 201/200/204/400/404/409 | baseline, 7 casos | d3843c0 |
| USR-023 | Valores y estados | CUMPLE | test/unit/registration-policy.spec.ts:4-17 compara límites, normalización, roles/transiciones | baseline | d3843c0 |
| USR-024 | Unicidad concurrente real | CUMPLE | test/integration/registration-concurrency.spec.ts:6-13; user.repository.ts:13-21; create_users/migration.sql:17-18 | baseline; Promise.all HTTP + count=1 | d3843c0 |
| USR-025 | Replay/transiciones/visibilidad | CORREGIDA | test/integration/registration-state.spec.ts:6-12; registration.contract.spec.ts:9-22; login-identity.spec.ts:6-9 | baseline; H6 detectada | 9f6729f |
| USR-026 | Firma service JWT | CORREGIDA | test/security/service-auth.spec.ts:20 añade clave no confiable; infrastructure/security/service-jwt.verifier.ts:8 | 7/7; mutación de firma dio 401 esperado/500 recibido; restaurado 7/7 y git diff vacío | a5b87cf |
| USR-027 | Modelo identidad sin credenciales | CUMPLE | prisma/schema.prisma:18-31 | baseline usa modelo real | d3843c0 |
| USR-028 | Constraints SQL locales | CUMPLE | prisma/migrations/202609280001_create_users/migration.sql:1-18 | migrations-health:13-22; registration-concurrency | d3843c0 |
| USR-029 | Validadores | CUMPLE | src/domain/users/values.ts:4-23 | registration-policy | d3843c0 |
| USR-030 | Máquina de estados/replay | CUMPLE | src/domain/users/user.entity.ts:4-6; registration.policy.ts:2-3 | registration-policy, registration-state | d3843c0 |
| USR-031 | Persistencia idempotente/local | CUMPLE | src/infrastructure/persistence/prisma/user.repository.ts:12-33; FOR UPDATE:28 | registration-concurrency/state | d3843c0 |
| USR-032 | Use cases sin password | CUMPLE | src/application/registration/create-pending-user.use-case.ts:5-6; activate:5; cancel:5 | registration.contract | d3843c0 |
| USR-033 | DTO cerrado | CUMPLE | src/interfaces/http/internal/registration.dto.ts:3-11; validation.pipe.ts:5; create-pending-user.use-case.ts:6 | registration.contract:24-26 | d3843c0 |
| USR-034 | Rutas/scopes delegados | CUMPLE | src/interfaces/http/internal/registration.controller.ts:10-18; modules/registration-state.module.ts:9-14 | registration.contract/service-auth | d3843c0 |
| USR-035 | Mapping seguro | CUMPLE | src/interfaces/http/internal/registration-error.mapper.ts:2 alias; problem.mapper.ts:4-10; problem.filter.ts:10-13 | contract 400/404/409 + secret-leakage | d3843c0 |
| USR-036 | Swagger equivalente | CUMPLE | src/interfaces/openapi/registration.openapi.ts:4-11 leídos | build:users y validate-users-openapi: exit 0; G1/G3 externos | e3287fa |
| USR-037 | Checkpoint RQ-02/FR-001–006 | CUMPLE | assertions registro arriba ejecutadas en baseline; no saga externa | 24/148 baseline y service-auth dirigida | d3843c0 |
| USR-038 | Shape mínimo/DTO | CORREGIDA | test/contract/login-identity.contract.spec.ts:6-11 compara shape y password; límite 254/255:13 | 2/2 verdes, mutación 254→255 detectada | 6939da0 |
| USR-039 | Normalización/exclusión | CUMPLE | test/unit/login-identity-policy.spec.ts:3-11; use-case:7-9 no devuelve PII | baseline | 9a67522 |
| USR-040 | Email vigente/estados | CUMPLE | test/integration/login-identity.spec.ts:6-14; consulta por emailNormalized | baseline | 9a67522 |
| USR-041 | Proyección Prisma | CUMPLE | src/infrastructure/persistence/prisma/login-identity.repository.ts:7-9 select id/role/status y ACTIVE | login-identity integration | 9a67522 |
| USR-042 | Ausente/no activo indistinguible | CUMPLE | src/application/login/resolve-login-identity.use-case.ts:7-9; repository:8 devuelve null para ambos | login-identity integration/unit; H10 detectada | 9a67522 |
| USR-043 | Endpoint y scope | CUMPLE | src/interfaces/http/internal/login-identity.controller.ts:8-12; dto:2; service-auth.guard.ts:19 | login-identity.contract | 9a67522 |
| USR-044 | Swagger/consumidor externo | CUMPLE | src/interfaces/openapi/login-identity.openapi.ts:5-6 | build:users y validate-users-openapi: exit 0; G1/G3 externos | e3287fa |
| USR-045 | Contrato perfil/foto/error | CORREGIDA | test/contract/profile.contract.spec.ts:89-174; status/code/shape/rollback | 6/6 verdes, mutación mapper detectada | 5fa78fa + 79cc220 |
| USR-046 | Patch/null/límites | CUMPLE | test/unit/profile-validation.spec.ts:3-12 asserts exactos y rechazos; registration-policy:8-10 límites nombre/email compartidos | baseline | 18d3262 |
| USR-047 | Atomicidad/concurrencia | CORREGIDA | test/integration/profile-update.spec.ts:7-24 verifica Promise.all, versión y rollback email; conflicto VERSION_CONFLICT:10 y EMAIL_CONFLICT:16 | baseline; H11 detectada, profile-update:10 | 59cc29c |
| USR-048 | Foto/fronteras/null | CUMPLE | test/integration/profile-photo.spec.ts:7-21: 5000000 acepta, 5000001 413, MIME 415, rollback, null | baseline; photo.contract verifica ETag/binario | 18d3262 |
| USR-049 | Modelo foto | CUMPLE | prisma/schema.prisma:34-41; User.version:27 | profile-photo, migrations-health | 18d3262 |
| USR-050 | CHECK/FK local | CORREGIDA | prisma/migrations/202609280002_add_profile_photo/migration.sql:2-6; User PK y email índice existentes; test/integration/migrations-health.spec.ts:28 | baseline; H7 detectada, migrations-health:28 | 064380b |
| USR-051 | Validadores dominio | CUMPLE | src/domain/profiles/profile.policy.ts:4-27; values.ts:5-15 | profile-validation | 18d3262 |
| USR-052 | Magic/size/hash | CUMPLE | src/domain/photos/photo.policy.ts:2-7; infrastructure/files/profile-photo.service.ts:4-5; controller:23-24 | photo-policy/profile-photo/profile.contract | 18d3262 |
| USR-053 | Transacción perfil/foto | CUMPLE | src/infrastructure/persistence/prisma/profile.repository.ts:23-41 updateMany+version, tx foto y P2002 | profile-update/photo | 18d3262 |
| USR-054 | Use cases saneados | CUMPLE | src/application/profiles/get-own-profile.use-case.ts:6; get-own-profile-photo:6; update-own-profile:6; repository projection:8 | profile.contract | 18d3262 |
| USR-055 | DTO cerrado | CUMPLE | src/interfaces/http/profiles/update-profile.dto.ts:4 delega policy:7-9 | profile-validation/restricted-fields | 18d3262 |
| USR-056 | Multipart cerrado | CUMPLE | src/interfaces/http/profiles/profile-multipart.interceptor.ts:10-29 | http-adapters:62-78 y profile-photo | 18d3262 |
| USR-057 | Endpoints bearer/binario | CUMPLE | src/interfaces/http/profiles/profile.controller.ts:13-24; modules/profiles.module.ts:10-15 | profile.contract/ownership | 18d3262 |
| USR-058 | Mapping HTTP seguro | CUMPLE | src/interfaces/http/profiles/profile-error.mapper.ts:1 alias; problem.mapper.ts:4-10; filter:10 | profile-update/photo; H11 detectada | 18d3262 |
| USR-059 | Swagger multipart | CUMPLE | src/interfaces/openapi/profile.openapi.ts:5-17 inspeccionado | build:users y validate-users-openapi: exit 0; G1/G3 externos | e3287fa |
| USR-060 | Checkpoint RQ-01 | CUMPLE | assertions perfil referidas arriba; baseline real FR-014–019/023 | baseline, no Gateway real | 18d3262 |
| USR-061 | JWT antes persistencia | CUMPLE | test/security/jwt-hardening.spec.ts:18-39: firma/alg/issuer/aud/exp/claims y cero findFirst | baseline | 18d3262 |
| USR-062 | Ownership puro/precedencia | CUMPLE | test/unit/profile-authorization.spec.ts:3-4; http-adapters:80-81 y roles:21-25 complementan guard real | baseline | 18d3262 |
| USR-063 | Mismo 403 ajeno | CUMPLE | test/integration/profile-ownership.spec.ts:7-15 tres roles y target existente/ausente, malformed antes lookup | baseline | 18d3262 |
| USR-064 | Mass assignment rollback | CUMPLE | test/integration/profile-restricted-fields.spec.ts:7-10 comparación DB completa | baseline | 18d3262 |
| USR-065 | JWT estricto | CUMPLE | src/interfaces/http/auth/jwt.strategy.ts:13-18 y verifier:7-9 | jwt-hardening; H4/H5 detectadas | 18d3262 |
| USR-066 | Ownership previo | CUMPLE | src/interfaces/http/guards/profile-ownership.guard.ts:9-10; domain/profiles/ownership.policy.ts:2 | ownership; H2/H3/H12 detectadas | 18d3262 |
| USR-067 | Roles metadata sin endpoint real | CUMPLE | src/interfaces/http/guards/roles.guard.ts:10-14; decorator:3; test/unit/roles.spec.ts:12-25 | baseline | 18d3262 |
| USR-068 | Campos restringidos | CUMPLE | src/interfaces/http/profiles/update-profile.dto.ts:4; interceptor:18-28; policy:7-9 | restricted-fields | 18d3262 |
| USR-069 | Swagger y precedencia | CUMPLE | controller:13,18; profile.openapi.ts:14,16 | build:users y validate-users-openapi: exit 0; G1/G3 externos | e3287fa |
| USR-070 | FR-020–024/SC-004 | CUMPLE | JWT/ownership/roles/mass assignment assertions leídas y ejecutadas | baseline | 18d3262 |

## G. Contrato y K. Compose

OpenAPI Users leído completo y confrontado con controladores y Swagger:

| Operación | Controlador | Request/respuesta/errores |
|---|---|---|
| GET /health/live | health.controller.ts:7-8 | sin auth, 200 |
| GET /health/ready | health.controller.ts:9-10 | sin auth, 200/503 |
| POST /internal/v1/registrations | registration.controller.ts:10-14 | DTO cerrado, serviceAuth, 201/400/401/403/409/503 |
| POST /internal/v1/registrations/{registrationId}/activate | registration.controller.ts:15-16 | UUID, serviceAuth, 200/400/401/403/404/409/503 |
| POST /internal/v1/registrations/{registrationId}/cancel | registration.controller.ts:17-18 | UUID, serviceAuth, 204/400/401/403/404/409/503 |
| POST /internal/v1/login-identities/resolve | login-identity.controller.ts:8-12 | email254, shape mínimo, serviceAuth, 200/400/401/403/404/503 |
| GET /internal/v1/users/{userId}/profile | profile.controller.ts:13-17 | bearer, owner, JSON, 200/401/403/404/503 |
| PATCH /internal/v1/users/{userId}/profile | profile.controller.ts:18-19 | multipart/profile JSON/foto, 200/400/401/403/404/409/413/415/503 |
| GET /internal/v1/users/{userId}/profile/photo | profile.controller.ts:20-24 | bearer owner, binario ETag, 200/401/403/404/503 |

`npm run build:users` y `node scripts/validate-users-openapi.mjs`: exit 0.
Paths/schemas/security/servers sin drift; contrato sin cambios. USR-036/044/059/069
pasan a CUMPLE con esta evidencia. USR-038 y USR-045 pasan a CORREGIDA (tests);
mutaciones email254 y problem-status fallan, restaurados 2/2 y 6/6 respectivamente.

Compose: primer intento, secretos existentes fuera del repo; up --build exitoso.
users-db healthy. users-migrate exit 0 sin migraciones pendientes (volumen existente),
fin 2026-09-29T14:40:48.778478902Z; users-service inició después,
14:40:48.922232788Z, healthy, usuario node, ports 3002/tcp:null.
Fetch interno /health/ready: 200 {status:ready}. No conflicto con 55432.
`docker compose ... down` eliminó solo estos tres contenedores/red; docker ps
confirmó stayhub-users-g2-tests activo en 127.0.0.1:55432 al terminar.
USR-007/008/021 pasan a CUMPLE con lectura y ejecución real; no cierra USR-075 externa.

## H. Mutaciones controladas (2026-09-29)

Antes de cada mutación se comprobó status sin cambios legítimos pendientes
(excepto este registro). El runner guardó/restauró bytes originales en finally,
comprobó git diff y ejecutó solo la suite indicada. Ninguna mutación se commiteó.
Comando: node .artifacts/revalidate-mutate.cjs .artifacts/mutation-N.json,
que ejecuta Jest --runInBand --runTestsByPath con USERS_TEST_DATABASE_URL en
127.0.0.1:55432. Los logs locales están ignorados por Git.

| mutación | suite | resultado observado | ¿sobrevivió inicialmente? | acción tomada |
|---|---|---|---|---|
| H1 límite 5.000.001 | photo-policy | 1/3 falla al perder PHOTO_TOO_LARGE | No | Restaurada |
| H2 omitir ownership | profile-ownership | 3/3 fallan: 403 esperado, 200 recibido | No | Restaurada |
| H3 ADMIN cross-user | profile-ownership | 1/3 falla: 403→200 | No | Restaurada |
| H4 omitir kid | jwt-hardening | 12/17 fallan; kid inválido produce 404 en vez de 401 | No | Restaurada |
| H5 omitir exp requerido | jwt-hardening | 1/17 falla: 401→404 | No | Restaurada |
| H6 quitar FOR UPDATE | registration-state | Antes 1/1 pasa; después 1/2 falla, STATE_CONFLICT→ACCEPTED | Sí | Carrera PostgreSQL real, commit 9f6729f; restaurada 2/2 |
| H7 quitar CHECK tamaño | migrations-health | Antes 3/3 pasan; después 1/4 falla, SQL acepta 5.000.001 | Sí | SQL directo y conservación bytes, 064380b; restaurada 4/4 |
| H8 serializar correo/JWT | secret-leakage | 1/2 falla por datos sensibles en log | No | Restaurada; verde 2/2 |
| H9 readiness ignora migración | migrations-health | 1/4 falla: 503 esperado, 200 recibido | No | Restaurada; verde 4/4 |
| H10 distinguir no activo | login-identity | 2/3 fallan: PENDING/CANCELLED 500 vs ausente 404 | No | Restaurada; verde 3/3 |
| H11 unificar conflictos 409 | profile-update | Antes 3/3 pasan; después 1/3 falla VERSION_CONFLICT→EMAIL_CONFLICT | Sí | Aserción explícita, 59cc29c; restaurada 3/3 |
| H12 body antes de ownership | profile-ownership | 3/3 fallan: 403 esperado, 400 recibido | No | Restaurada; verde 3/3 |

Las suites restauradas H8/H9/H10/H12 se ejecutaron juntas con Jest
--runInBand --runTestsByPath: 4/4 suites, 12/12 pruebas, exit 0 (10.115 s).
H11 restaurada: 1/1 suite, 3/3 pruebas, exit 0 (4.578 s).
H4 incluye fallos posteriores por el contador de repositorio contaminado;
los casos de kid sí detectaron directamente el defecto (401→404).

También se comprobaron mutaciones dirigidas de firma RSA (USR-026),
email 254→255 (USR-038) y status del mapper (USR-045): detectadas y restauradas.
Los aliases registration-error.mapper.ts:2 y profile-error.mapper.ts:1
reexportan problem.mapper.ts; problem.filter.ts:10 aplica el mapeo efectivo.

## I. Dependencias externas USR-071–078

Inspección directa: apps/auth-service y apps/api-gateway no existen en este
workspace. La suite users-provider.contract.spec.ts:6 indica explícitamente
que no instancia Auth/Gateway. Sus dos escenarios son evidencia provider-side.

| tarea | parte Users preparada | dependencia / falta para integración completa | estado |
|---|---|---|---|
| USR-071 | Registro, replay, estados y concurrencia; registration-state.spec.ts:6 | G3 cliente/orquestador real, service JWT, timeout/retry y saga conjunta | BLOQUEADA |
| USR-072 | Lookup ACTIVE mínimo; login-identity.spec.ts:6 | G3 consumidor real y login genérico ante ausencia/no activo | BLOQUEADA |
| USR-073 | Perfil/foto, ownership y errores; profile.contract.spec.ts:6 | G1 rutas, introspección, stripping, streaming y timeout reales | BLOQUEADA |
| USR-074 | Provider local users-provider.contract.spec.ts:6 y drift validado | Expectativas consumer aprobadas y ejecución con G1/G3 | BLOQUEADA |
| USR-075 | Compose Users construido y comprobado; Dockerfile:1 | G1 coordinación de red/readiness y USR-071–073 completas | BLOQUEADA |
| USR-076 | validate-users-openapi.mjs:1, secret-leakage.spec.ts:6 y ci.yml:34-38 | USR-074 externa y ejecución CI remota no acreditadas | NO VERIFICABLE |
| USR-077 | fixtures/consumer-handoff.fixture.ts:1 y provider local | E2E HTTPS ejecutado por G1 con Auth operativo G3 | BLOQUEADA |
| USR-078 | Migraciones, cobertura, seguridad, concurrencia y Compose locales | CI remota, revisión independiente y resultados coordinados USR-071–077 | NO VERIFICABLE |

## Correcciones y límites de evidencia

- USR-026: firma RSA no confiable, a5b87cf.
- USR-038: email 254/255, 6939da0.
- USR-045: errores contractuales 400/409/413/415, 5fa78fa.
- USR-025: carrera real activate/cancel, 9f6729f.
- USR-050: CHECK SQL directo, 064380b.
- USR-047: distinción de conflictos, 59cc29c.
- 79cc220 era un commit nuevo al retomar: conserva assertions del contrato
  y sustituye expect.any(Array) por Array.isArray para cumplir lint; se preservó.
- No se cambiaron fuentes productivas, contratos, versiones ni timeouts.
- Al crear el test SQL, una comparación Jest de 5 MB consumió memoria excesiva;
  se interrumpió esa ejecución y se sustituyó la comparación nueva por
  Buffer.equals con igualdad binaria exacta. La ejecución interrumpida no cuenta
  como validación. Las corridas posteriores dirigidas sí pasaron.
- El primer nuevo test 413 esperaba PHOTO_TOO_LARGE; el parser devuelve HTTP_413
  permitido por OpenAPI. Se corrigió la expectativa nueva; no fue rojo de producción.
- research.md:161 y quickstart.md:125 aún dicen 5 MiB. Quedan sin editar por alcance;
  código, migración y contrato aplican 5.000.000 bytes.
- El orden test-first histórico y la revisión humana independiente no se infieren
  de commits. Tampoco se equipara provider local a integración G1/G3.
- No se ejecutó npm audit en esta continuación; no se atribuyen cifras nuevas
  de vulnerabilidades a esta revalidación.
- CI exige cobertura unitaria independiente: ci.yml:34 usa users-unit;
  jest.config.ts:16 exige 70% en sentencias, ramas, funciones y líneas.
  La cobertura combinada final no sustituye esa ejecución unitaria separada.

## J. Cierre

Antes de ejecutar el cierre, git status --short y git diff devolvieron salida
vacía sobre 05922f9. La comparación contra 7d09ec6 contiene únicamente este
documento y seis archivos de tests Users: no fuentes productivas, contratos,
dependencias, timeouts, secretos ni archivos temporales incorporados a Git.
Los logs y runners de evidencia permanecen ignorados en .artifacts; no son entregables.

Corrida final única, 2026-09-29, desde apps/users-service, con
USERS_TEST_DATABASE_URL apuntando a 127.0.0.1:55432/users_db:

| comando | resultado real |
|---|---|
| npm run lint | exit 0 |
| npm run typecheck | exit 0 |
| npm test -- --coverage | exit 0; 24/24 suites, 156/156 pruebas, 41.917 s; cuatro proyectos |

Fuente de cobertura: coverage/users/coverage-summary.json (raíz del repo).
LastWriteTimeUtc: **2026-09-29T19:42:05.6830413Z**.

| métrica | línea base | cierre |
|---|---|---|
| suites | 24/24 | 24/24 |
| pruebas | 148/148 | 156/156 |
| sentencias | 96,29% (676/702) | 96,29% (676/702) |
| ramas | 90,37% (216/239) | 90,37% (216/239) |
| funciones | 95,23% (120/126) | 95,23% (120/126) |
| líneas | 98,05% (504/514) | 98,05% (504/514) |

Cobertura global combinada ≥70% en las cuatro métricas. Ocho casos nuevos
refuerzan assertions sin aumentar la cobertura estructural; H11 añade una
aserción a un caso existente. No se ejecutó otra suite unitaria separada en este
cierre ni se presenta la cobertura combinada como cobertura exclusivamente unitaria.

Resultado consolidado: 64 CUMPLE y 6 CORREGIDA entre USR-001–070;
6 BLOQUEADA y 2 NO VERIFICABLE entre USR-071–078.
H1–H12 detectadas y restauradas; H6/H7/H11 sobrevivieron inicialmente.
PostgreSQL stayhub-users-g2-tests permanece activo en 127.0.0.1:55432.
Sin push, reset ni rebase. No existen hooks de extensión (.specify/extensions.yml ausente).

## Corrección posterior: timeout de foto (2026-09-29)

El cierre J anterior permanece como evidencia histórica; no probaba una escritura
que durase más de cinco segundos. El diagnóstico aportado por otro entorno sobre
66134ce mostró P2028 a los 6314/6503 ms con IPv4. Se autoriza posteriormente
la corrección acotada de ese timeout, sin cambiar timeouts de Jest ni versiones.

Se añadió en profile-photo.spec.ts:11 una prueba con PostgreSQL real y trigger
temporal de pg_sleep(6), aislado en el schema de la suite y eliminado en finally.
Antes de corregir: 1/7 falla por 200 esperado, 503 recibido; las otras seis pasan.
Después: la escritura conserva exactamente los 5.000.000 bytes y confirma
perfil y versión juntos. profile.repository.ts:39 establece timeout:15_000.
El diagnóstico usa UsersLogger.profileUpdateFailure: solo operación fija y código
Prisma de forma Pdddd, o UNKNOWN; nunca serializa message, meta, stack o payload.
La nota README que daba IPv4 como solución suficiente se corrigió.

Validación posterior, 2026-09-29, USERS_TEST_DATABASE_URL en 127.0.0.1:55432:
- npm run lint: exit 0.
- npm run typecheck: exit 0.
- node ../../node_modules/jest/bin/jest.js --runInBand --runTestsByPath
  test/integration/profile-photo.spec.ts test/integration/profile-update.spec.ts
  test/security/secret-leakage.spec.ts test/contract/profile.contract.spec.ts:
  exit 0, 4/4 suites, 19/19 pruebas, 19.694 s.

No se repitió la suite completa ni se regeneró cobertura en esta corrección.
Falta repetir en la máquina que reportó el incidente; la prueba local demuestra
el caso >5 s, no garantiza éxito si la operación excede también 15 s.

## Integración Auth↔Users (2026-09-30)

Esta sección se añade a la evidencia histórica anterior, que se conserva sin cambios. El estado
de la sección I en 2026-09-29 decía que `apps/auth-service` no existía en el workspace. Ese hecho ya
no es cierto: Auth existe y se integró con Users real sin Gateway. Resumen completo:
`agents/integracion/resultado.md`.

Cambios en Users:
- `GET /internal/v1/registrations/{registrationId}` (`GetRegistration`, `findByRegistrationId`),
  con scope `users:registration`, `UserSummary` actual y respuestas 400/401/403/404/503.
- OpenAPI regenerado, sin drift.
- Swagger configurable con `USERS_SWAGGER_SERVER_URL`.
- Dockerfile de Users corregido: el runtime no encontraba `@nestjs/swagger`.
- Healthcheck explícito de `users-service` en `docker-compose.yml` (podman ignora el `HEALTHCHECK`
  OCI).

Verificación final (Node 22.22.2, podman 5.8.7, PostgreSQL 16 desechable):
- `npm run test:users`: 24 suites, 169 tests.
- Cobertura: 96,27 % sentencias, 90,8 % ramas, 95,48 % funciones y 97,93 % líneas. Archivos
  modificados: 100 %, salvo `user.repository.ts` (97/100/100/96).
- `lint`, `typecheck`, `build` y `validate-users-openapi.mjs`: exit 0.
- `npm run test:auth-users`: 9 suites, 38 tests, INT-01–17.

Estado de USR-071–078 respecto a la sección I:

| tarea | bloqueo antiguo | estado tras la integración |
|---|---|---|
| USR-071 | G3 cliente/orquestador real | Resuelto el bloqueo G3: saga, idempotencia, concurrencia, retry y PENDING no autenticable verificados con Auth real. Abierta: el timeout literal no se ejecutó contra Users real |
| USR-072 | G3 consumidor lookup | Resuelta: lookup mínimo ACTIVE, exclusión de no activos, correo vigente tras el cambio de perfil y fallo seguro (marcada en tasks) |
| USR-073 | G1 rutas/introspección | Sigue BLOQUEADA por Gateway. Solo se acreditó el perfil directo con el JWT de un login real de Auth |
| USR-074 | Expectativas consumer G1/G3 | Parcial: los consumidores de Auth validan las respuestas reales contra el OpenAPI. Faltan las expectativas de G1 y la aprobación contractual |
| USR-075 | G1 red/readiness | Parcial: `dev:swagger:docker` arranca Users real con migración previa, healthcheck y volumen, sin publicar puertos en el Compose base. Falta la coordinación de G1 |
| USR-076 | CI remota | NO VERIFICABLE: la CI remota no se ejecutó |
| USR-077 | E2E HTTPS de G1 | Sigue BLOQUEADA: el recorrido directo pasa, pero no hay HTTPS de borde |
| USR-078 | CI remota y revisión independiente | NO VERIFICABLE: sin CI remota ni revisión humana |

Fuera de alcance y sin cambios: introspección de sesión en Users. Users no rechaza el JWT de una
sesión revocada; ese control corresponde al Gateway.

