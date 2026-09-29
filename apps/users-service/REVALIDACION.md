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

## B. Fases 1 y 2

| tarea | criterio | estado | evidencia archivo:línea | test/comando | commit |
|---|---|---|---|---|---|
| USR-001 | Workspace Users y comandos | CUMPLE | package.json:5-26 (raíz), package-lock.json:17-63, nest-cli.json:12 | línea base | bloque B |
| USR-002 | Capas/bootstrap 3002 | CUMPLE | src/main.ts:12-20; src/app.module.ts:10; infrastructure/config/users-config.ts:35 | http-adapters, config | bloque B |
| USR-003 | Strict/aliases | CUMPLE | tsconfig.base.json:6-23; tsconfig.json:2-8; tsconfig.build.json:4-7 | typecheck | bloque B |
| USR-004 | Cuatro proyectos y cobertura | CUMPLE | jest.config.ts:5-17; test/*/setup.ts:1-2 | línea base | bloque B |
| USR-005 | Config documentada | CUMPLE | .env.example:2-23; README.md:7-29 | config | bloque B |
| USR-006 | Prisma Users y migraciones | CUMPLE | prisma/schema.prisma:1-4,44-46; package.json:20-22 | migrations-health (deploy real) | bloque B |
| USR-007 | Imagen no root | NO VERIFICABLE | infra/docker/users/Dockerfile:1-30; .dockerignore:1-11 | revisión estática correcta; arranque K pendiente | bloque B |
| USR-008 | Compose privado | NO VERIFICABLE | docker-compose.yml:1-68; secrets, volumen, internal y restart explícitos | runtime K pendiente | bloque B |
| USR-009 | Etapas CI | CUMPLE | .github/workflows/ci.yml:29-38: ci/generate/deploy/lint/types/unit/combined/build/drift/image | inspección; CI remota no ejecutada | bloque B |
| USR-010 | Config falla cerrada | CUMPLE | src/infrastructure/config/users-config.ts:12-42; config.module.ts:4 | config.spec.ts:14-22 exige cada variable, db ajena, puerto/tamaño | bloque B |
| USR-011 | Lifecycle/users_db | CUMPLE | src/infrastructure/persistence/prisma/prisma.service.ts:6-13; prisma.module.ts:4 | migrations-health | bloque B |
| USR-012 | Whitelist/Problem | CUMPLE | src/interfaces/http/validation.pipe.ts:4-7; problem.filter.ts:10-13; problem.mapper.ts:4-10 | http-adapters:34-47,69-87; secret-leakage:18-23 | bloque B |
| USR-013 | Logs sin PII y OTLP | CUMPLE | src/infrastructure/logging/users-logger.ts:6-17; observability/otel.ts:5-14; interfaces/http/trace.interceptor.ts:11-20 | secret-leakage:6-16; telemetry:5-12 export real local | bloque B |
| USR-014 | Service JWT y scopes | CUMPLE | src/interfaces/http/guards/service-auth.guard.ts:7-20; infrastructure/security/service-jwt.verifier.ts:6-11 | service-auth:18-22; shared verifier inspeccionado | bloque B |
| USR-015 | Bearer/claims canónicos | CUMPLE | src/interfaces/http/auth/jwt.strategy.ts:13-18; modules/users-auth.module.ts:5 | jwt-hardening; revisión US4 pendiente | bloque B |
| USR-016 | Puertos sin Prisma | CUMPLE | src/application/ports/user.repository.ts:1-12; profile.repository.ts:1-11; unit-of-work.ts:3 | typecheck y lectura directa | bloque B |
| USR-017 | Errores sin HTTP en dominio | CUMPLE | src/domain/shared/domain-error.ts:1-6; application/errors/users-errors.ts:1 | registration-policy/http-adapters | bloque B |
| USR-018 | Ready exige migraciones | CUMPLE | src/modules/health/health.controller.ts:7-10; prisma.service.ts:11-12 | migrations-health:7-11 invalida finished_at y espera 503 | bloque B |
| USR-019 | Swagger interno/UI dev | CUMPLE | src/interfaces/openapi/openapi.factory.ts:4-11; openapi.module.ts:1-3; main.ts:17 | http-adapters:94-96 | bloque B |
| USR-020 | Harness real aislado | CUMPLE | test/integration/postgres.setup.ts:16-43; fixtures/users.fixture.ts:4-18 | migrations-health:13-22; schema por suite, reset por prueba, helper rollback comprobado | bloque B |
| USR-021 | Integración global/3002 privado | NO VERIFICABLE | src/app.module.ts:10; main.ts:16-20; configure-http.ts:7-10; compose sin ports | http-adapters verde; runtime K pendiente | bloque B |

## Punto retomable

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

## H. Mutaciones finales

H1–5 detectadas: límite foto (PHOTO_TOO_LARGE incorrecto), ownership 403→200,
ADMIN 403→200, kid 401→404, exp ausente 401→404. Todas restauradas, diff vacío.
H6 SOBREVIVIÓ inicialmente: registration-state 1/1 aun sin FOR UPDATE.
Se añade carrera determinista con bloqueo PostgreSQL real: una activación retiene
fila, cancelación espera (pg_stat_activity), luego debe releer ACTIVE y rechazar.
No se usan mocks de persistencia ni se aumentan timeouts.

Cada runner exige git status limpio (excepto este registro), guarda bytes originales,
ejecuta una suite, restaura en finally, ejecuta git diff y compara bytes exactos.
Logs ignorados .artifacts/mutation-N.log. Ninguna mutación se commitea.

USR-045: cuatro errores contractuales añadidos; 6/6 verdes. Primer fallo fue
expectativa incorrecta nueva PHOTO_TOO_LARGE vs HTTP_413 del límite multer;
se corrigió al código real permitido por OpenAPI (code:string), sin cambiar
assertions previas. No cuenta como rojo de producción. Pendiente mutación mapper.
USR-038: mutación 254→255 detectada (400 esperado/404 recibido); restaurado 2/2.

## E. US3 perfil

| tarea | criterio | estado | evidencia archivo:línea | test/comando | commit |
|---|---|---|---|---|---|
| USR-045 | Contrato perfil/foto/error | NO CUMPLE | test/contract/profile.contract.spec.ts:7-20 cubre 200/401/403/404; 400/409/413/415 cubiertos en integración pero faltan aquí | baseline; reforzar contrato | bloque E |
| USR-046 | Patch/null/límites | CUMPLE | test/unit/profile-validation.spec.ts:3-12 asserts exactos y rechazos; registration-policy:8-10 límites nombre/email compartidos | baseline | bloque E |
| USR-047 | Atomicidad/concurrencia | CUMPLE | test/integration/profile-update.spec.ts:7-24 verifica Promise.all, versión y rollback email | baseline; H11 debe desafiar código versión | bloque E |
| USR-048 | Foto/fronteras/null | CUMPLE | test/integration/profile-photo.spec.ts:7-21: 5000000 acepta, 5000001 413, MIME 415, rollback, null | baseline; photo.contract verifica ETag/binario | bloque E |
| USR-049 | Modelo foto | CUMPLE | prisma/schema.prisma:34-41; User.version:27 | profile-photo, migrations-health | bloque E |
| USR-050 | CHECK/FK local | CUMPLE | prisma/migrations/202609280002_add_profile_photo/migration.sql:2-6; User PK y email índice existentes | baseline; H7 debe desafiar tamaño SQL | bloque E |
| USR-051 | Validadores dominio | CUMPLE | src/domain/profiles/profile.policy.ts:4-27; values.ts:5-15 | profile-validation | bloque E |
| USR-052 | Magic/size/hash | CUMPLE | src/domain/photos/photo.policy.ts:2-7; infrastructure/files/profile-photo.service.ts:4-5; controller:23-24 | photo-policy/profile-photo/profile.contract | bloque E |
| USR-053 | Transacción perfil/foto | CUMPLE | src/infrastructure/persistence/prisma/profile.repository.ts:23-41 updateMany+version, tx foto y P2002 | profile-update/photo | bloque E |
| USR-054 | Use cases saneados | CUMPLE | src/application/profiles/get-own-profile.use-case.ts:6; get-own-profile-photo:6; update-own-profile:6; repository projection:8 | profile.contract | bloque E |
| USR-055 | DTO cerrado | CUMPLE | src/interfaces/http/profiles/update-profile.dto.ts:4 delega policy:7-9 | profile-validation/restricted-fields | bloque E |
| USR-056 | Multipart cerrado | CUMPLE | src/interfaces/http/profiles/profile-multipart.interceptor.ts:10-29 | http-adapters:62-78 y profile-photo | bloque E |
| USR-057 | Endpoints bearer/binario | CUMPLE | src/interfaces/http/profiles/profile.controller.ts:13-24; modules/profiles.module.ts:10-15 | profile.contract/ownership | bloque E |
| USR-058 | Mapping HTTP seguro | CUMPLE | src/interfaces/http/profiles/profile-error.mapper.ts:1 alias; problem.mapper.ts:4-10; filter:10 | profile-update/photo; H11 pendiente | bloque E |
| USR-059 | Swagger multipart | NO VERIFICABLE | src/interfaces/openapi/profile.openapi.ts:5-17 inspeccionado | G pendiente | bloque E |
| USR-060 | Checkpoint RQ-01 | CUMPLE | assertions perfil referidas arriba; baseline real FR-014–019/023 | baseline, no Gateway real | bloque E |

## F. US4 autorización

| tarea | criterio | estado | evidencia archivo:línea | test/comando | commit |
|---|---|---|---|---|---|
| USR-061 | JWT antes persistencia | CUMPLE | test/security/jwt-hardening.spec.ts:18-39: firma/alg/issuer/aud/exp/claims y cero findFirst | baseline | bloque F |
| USR-062 | Ownership puro/precedencia | CUMPLE | test/unit/profile-authorization.spec.ts:3-4; http-adapters:80-81 y roles:21-25 complementan guard real | baseline | bloque F |
| USR-063 | Mismo 403 ajeno | CUMPLE | test/integration/profile-ownership.spec.ts:7-15 tres roles y target existente/ausente, malformed antes lookup | baseline | bloque F |
| USR-064 | Mass assignment rollback | CUMPLE | test/integration/profile-restricted-fields.spec.ts:7-10 comparación DB completa | baseline | bloque F |
| USR-065 | JWT estricto | CUMPLE | src/interfaces/http/auth/jwt.strategy.ts:13-18 y verifier:7-9 | jwt-hardening; H4/5 pendiente | bloque F |
| USR-066 | Ownership previo | CUMPLE | src/interfaces/http/guards/profile-ownership.guard.ts:9-10; domain/profiles/ownership.policy.ts:2 | ownership; H2/3/12 pendiente | bloque F |
| USR-067 | Roles metadata sin endpoint real | CUMPLE | src/interfaces/http/guards/roles.guard.ts:10-14; decorator:3; test/unit/roles.spec.ts:12-25 | baseline | bloque F |
| USR-068 | Campos restringidos | CUMPLE | src/interfaces/http/profiles/update-profile.dto.ts:4; interceptor:18-28; policy:7-9 | restricted-fields | bloque F |
| USR-069 | Swagger y precedencia | NO VERIFICABLE | controller:13,18; profile.openapi.ts:14,16 | ownership verde; G pendiente | bloque F |
| USR-070 | FR-020–024/SC-004 | CUMPLE | JWT/ownership/roles/mass assignment assertions leídas y ejecutadas | baseline | bloque F |

USR-038: test contractual 254 aceptado/255 rechazado con cero lookup añadido;
ejecución dirigida 2/2 verde. Guardado antes de mutación 254→255 para validar
sensibilidad sin cambios legítimos pendientes. Producción sin cambios.

## D. US2 lookup

| tarea | criterio | estado | evidencia archivo:línea | test/comando | commit |
|---|---|---|---|---|---|
| USR-038 | Shape mínimo/DTO | NO CUMPLE | test/contract/login-identity.contract.spec.ts:6-11 compara shape y password; falta límite 254 explícito | baseline verde no acredita ese límite; reforzar antes cierre | bloque D |
| USR-039 | Normalización/exclusión | CUMPLE | test/unit/login-identity-policy.spec.ts:3-11; use-case:7-9 no devuelve PII | baseline | bloque D |
| USR-040 | Email vigente/estados | CUMPLE | test/integration/login-identity.spec.ts:6-14; consulta por emailNormalized | baseline | bloque D |
| USR-041 | Proyección Prisma | CUMPLE | src/infrastructure/persistence/prisma/login-identity.repository.ts:7-9 select id/role/status y ACTIVE | login-identity integration | bloque D |
| USR-042 | Ausente/no activo indistinguible | CUMPLE | src/application/login/resolve-login-identity.use-case.ts:7-9; repository:8 devuelve null para ambos | login-identity integration/unit; H10 pendiente | bloque D |
| USR-043 | Endpoint y scope | CUMPLE | src/interfaces/http/internal/login-identity.controller.ts:8-12; dto:2; service-auth.guard.ts:19 | login-identity.contract | bloque D |
| USR-044 | Swagger/consumidor externo | NO VERIFICABLE | src/interfaces/openapi/login-identity.openapi.ts:5-6 | G pendiente; no existe Auth operativo en workspace | bloque D |

## C. US1 registro

| tarea | criterio | estado | evidencia archivo:línea | test/comando | commit |
|---|---|---|---|---|---|
| USR-022 | HTTP registro y DTO cerrado | CUMPLE | test/contract/registration.contract.spec.ts:9-26 afirma proyección y 201/200/204/400/404/409 | baseline, 7 casos | bloque C |
| USR-023 | Valores y estados | CUMPLE | test/unit/registration-policy.spec.ts:4-17 compara límites, normalización, roles/transiciones | baseline | bloque C |
| USR-024 | Unicidad concurrente real | CUMPLE | test/integration/registration-concurrency.spec.ts:6-13; user.repository.ts:13-21; create_users/migration.sql:17-18 | baseline; Promise.all HTTP + count=1 | bloque C |
| USR-025 | Replay/transiciones/visibilidad | CUMPLE | test/integration/registration-state.spec.ts:6-12; registration.contract.spec.ts:9-22; login-identity.spec.ts:6-9 | baseline; carrera activate/cancel a desafiar en H6 | bloque C |
| USR-026 | Firma service JWT | CORREGIDA | test/security/service-auth.spec.ts:20 añade clave no confiable; infrastructure/security/service-jwt.verifier.ts:8 | 7/7; mutación de firma dio 401 esperado/500 recibido; restaurado 7/7 y git diff vacío | a5b87cf |
| USR-027 | Modelo identidad sin credenciales | CUMPLE | prisma/schema.prisma:18-31 | baseline usa modelo real | bloque C |
| USR-028 | Constraints SQL locales | CUMPLE | prisma/migrations/202609280001_create_users/migration.sql:1-18 | migrations-health:13-22; registration-concurrency | bloque C |
| USR-029 | Validadores | CUMPLE | src/domain/users/values.ts:4-23 | registration-policy | bloque C |
| USR-030 | Máquina de estados/replay | CUMPLE | src/domain/users/user.entity.ts:4-6; registration.policy.ts:2-3 | registration-policy, registration-state | bloque C |
| USR-031 | Persistencia idempotente/local | CUMPLE | src/infrastructure/persistence/prisma/user.repository.ts:12-33; FOR UPDATE:28 | registration-concurrency/state | bloque C |
| USR-032 | Use cases sin password | CUMPLE | src/application/registration/create-pending-user.use-case.ts:5-6; activate:5; cancel:5 | registration.contract | bloque C |
| USR-033 | DTO cerrado | CUMPLE | src/interfaces/http/internal/registration.dto.ts:3-11; validation.pipe.ts:5; create-pending-user.use-case.ts:6 | registration.contract:24-26 | bloque C |
| USR-034 | Rutas/scopes delegados | CUMPLE | src/interfaces/http/internal/registration.controller.ts:10-18; modules/registration-state.module.ts:9-14 | registration.contract/service-auth | bloque C |
| USR-035 | Mapping seguro | CUMPLE | src/interfaces/http/internal/registration-error.mapper.ts:2 alias; problem.mapper.ts:4-10; problem.filter.ts:10-13 | contract 400/404/409 + secret-leakage | bloque C |
| USR-036 | Swagger equivalente | NO VERIFICABLE | src/interfaces/openapi/registration.openapi.ts:4-11 leídos | comparación completa G pendiente | bloque C |
| USR-037 | Checkpoint RQ-02/FR-001–006 | CUMPLE | assertions registro arriba ejecutadas en baseline; no saga externa | 24/148 baseline y service-auth dirigida | bloque C |

Los aliases de USR-035/058 satisfacen las tareas: estas exigen comportamiento y
ubicación, no duplicación de implementación. El filtro global aplica el mapper
canónico; separar la lógica duplicaría política contra constitución VI.

USR-026: CORREGIDA (cobertura): service-auth.spec.ts:20 añade firma RSA no confiable
con claims correctos; 7/7 casos verdes. Producción ya rechaza. Se guarda el cambio
legítimo antes de mutar el verificador; falta demostrar detección de firma omitida.

Inspección B terminada. US1 en revisión: leídos tests registro, dominio, repositorio,
controladores y migración inicial. Pendiente: use cases registration, reforzar
cobertura de firma service JWT y carrera activate/cancel; continuar C y D, E, F,
G, K, H (12 mutaciones), I y cierre J. Ninguna mutación realizada todavía.
