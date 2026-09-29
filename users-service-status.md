# Estado de users-service — Grupo 2

Rama: `feat/users-perfil-authz`. Checkpoint WIP conservado: `fb18495`.

## Verificado por el usuario, no reejecutado

- Lint y typecheck sin errores; 23 suites y 142 pruebas verdes.
- Cobertura combinada: 96,15% sentencias, 89,95% ramas, 95,23% funciones,
  98,05% líneas; umbral 70% cumplido.
- Docker multi-stage correcto, usuario `node`, healthcheck `/health/ready`;
  Compose válido y puerto 3002 no publicado.
- Existen Dockerfile, Compose, CI, validador OpenAPI y las dos migraciones.
- P2028 resuelto con `127.0.0.1`; no ajustar timeouts ni profile.repository.ts.

## Pendiente de esta continuación

- Clasificar USR-001–070 mediante existencia de rutas y evidencia citada;
  marcar solamente `tasks/tasks_userService.md`.
- Revisar mappers de errores, diferencias contractuales y etapas/umbral CI.
- Completar aportes provider/fixtures Users de USR-071–078, sin fingir G1/G3.
- Verificar arranque Compose y ejecutar la validación final única.
- Documentar resultados reales, bloqueos y dejar cambios en commits pequeños.

Los resultados comunicados no acreditan integración con G1/G3 ni CI remota.
La trazabilidad por archivo de US1/US3/US4 está en
`specs/001-fundamentos-identidad/validation-report.md`.

## Bloque 0 completado

Commits separados: `807b5c0` (.env.example), `26eab41` (README Windows),
`f2dd02e` (reporte Users), `5bddc6e` (estado inicial).

## Auditoría de rutas y evidencia USR-001–070

El 2026-09-29 se comprobó con Test-Path la existencia de **todas** las rutas
`in path` de las 70 tareas, expandiendo grupos y comodines. Ninguna falta.
Los archivos de prueba se enumeraron, sin releer los .spec.ts ni analizar sus casos.
Rutas de pruebas relativas a `apps/users-service/test/`; rutas de implementación
relativas a `apps/users-service/src/`, salvo manifiestos, Prisma e infraestructura.
Las marcas pendientes se consolidarán en un solo commit tras revisar OpenAPI/CI;
Compose conserva su verificación de arranque pendiente.

| USR | Estado | Evidencia | Validación / falta |
|---|---|---|---|
| USR-001 | COMPLETADA | Workspace y scripts: `unit/http-adapters.spec.ts`; `package.json`; `nest-cli.json` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-002 | COMPLETADA | Bootstrap/capas: `unit/http-adapters.spec.ts`; `src/main.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-003 | COMPLETADA | Tipos estrictos y aliases: `tsconfig.base.json`; `apps/users-service/tsconfig.json`; `typecheck comunicado` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-004 | COMPLETADA | Jest, cuatro proyectos y umbral 70%: `jest.config.ts`; `23 suites comunicadas` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-005 | COMPLETADA | Variables Users documentadas: `.env.example`; `README.md`; `unit/config.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-006 | COMPLETADA | Prisma 6 PostgreSQL, cliente y comandos: `prisma/schema.prisma`; `package.json`; `integration/migrations-health.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-007 | COMPLETADA | Imagen multi-stage/no root/healthcheck: `infra/docker/users/Dockerfile`; `infra/docker/users/.dockerignore`; `Docker verificado por usuario` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-008 | PARCIAL | Compose G2: `docker-compose.yml`; `configuration verificada por usuario`; `arranque real pendiente` | Falta arranque real Compose (paso 5). |
| USR-009 | PARCIAL | Etapas CI Users: `.github/workflows/ci.yml`; `revisión de etapas pendiente`; `CI remota no ejecutada` | Falta revisión CI del paso 3. |
| USR-010 | COMPLETADA | Configuración validada: `unit/config.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-011 | COMPLETADA | Prisma/lifecycle/users_db: `integration/migrations-health.spec.ts`; `integration/profile-update.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-012 | COMPLETADA | Validación/Problem Details: `unit/http-adapters.spec.ts`; `security/secret-leakage.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-013 | COMPLETADA | Trazas/logs/OTLP: `unit/telemetry.spec.ts`; `unit/http-adapters.spec.ts`; `security/secret-leakage.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-014 | COMPLETADA | Service JWT/scopes: `security/service-auth.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-015 | COMPLETADA | Passport RS256/claims: `security/jwt-hardening.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-016 | COMPLETADA | Puertos de repositorio/unidad de trabajo: `application/ports/{user.repository,profile.repository,unit-of-work}.ts`; `unit/http-adapters.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-017 | COMPLETADA | Errores dominio/aplicación: `domain/shared/domain-error.ts`; `application/errors/users-errors.ts`; `unit/http-adapters.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-018 | COMPLETADA | Live/ready y migraciones: `integration/migrations-health.spec.ts`; `unit/http-adapters.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-019 | COMPLETADA | Swagger interno: `unit/http-adapters.spec.ts`; `interfaces/openapi/openapi.factory.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-020 | COMPLETADA | Harness PostgreSQL/migraciones/rollback/fixtures: `integration/postgres.setup.ts`; `fixtures/users.fixture.ts`; `integration/migrations-health.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-021 | COMPLETADA | Composición base: `unit/http-adapters.spec.ts`; `src/app.module.ts`; `src/main.ts`; `docker-compose.yml` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-022 | COMPLETADA | Contrato registro: `contract/registration.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-023 | COMPLETADA | Políticas registro: `unit/registration-policy.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-024 | COMPLETADA | Concurrencia/índices: `integration/registration-concurrency.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-025 | COMPLETADA | Estados/replays: `integration/registration-state.spec.ts`; `integration/login-identity.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-026 | COMPLETADA | Service auth negativa: `security/service-auth.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-027 | COMPLETADA | Modelo User: `prisma/schema.prisma`; `integration/registration-concurrency.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-028 | COMPLETADA | Migración User: `prisma/migrations/202609280001_create_users/migration.sql`; `integration/migrations-health.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-029 | COMPLETADA | Value objects identidad: `unit/registration-policy.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-030 | COMPLETADA | Transiciones User: `unit/registration-policy.spec.ts`; `integration/registration-state.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-031 | COMPLETADA | Repositorio registro: `integration/registration-concurrency.spec.ts`; `integration/registration-state.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-032 | COMPLETADA | Casos de uso registro: `contract/registration.contract.spec.ts`; `unit/http-adapters.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-033 | COMPLETADA | DTO cerrado registro: `contract/registration.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-034 | COMPLETADA | Controladores registro: `contract/registration.contract.spec.ts`; `security/service-auth.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-035 | COMPLETADA | Mapeo errores registro centralizado: `interfaces/http/problem.mapper.ts`; `contract/registration.contract.spec.ts`; `unit/http-adapters.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-036 | PARCIAL | Swagger registro/drift: `contract/registration.contract.spec.ts`; `interfaces/openapi/registration.openapi.ts`; `scripts/validate-users-openapi.mjs` | Falta revisión semántica/drift del paso 2. |
| USR-037 | COMPLETADA | Checkpoint US1: `mapeo exacto US1 en validation-report.md`; `23 suites/142 pruebas comunicadas` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-038 | COMPLETADA | Contrato lookup: `contract/login-identity.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-039 | COMPLETADA | Política lookup mínima: `unit/login-identity-policy.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-040 | COMPLETADA | Persistencia lookup/correo vigente: `integration/login-identity.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-041 | COMPLETADA | Repositorio lookup: `integration/login-identity.spec.ts`; `contract/login-identity.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-042 | COMPLETADA | Caso de uso lookup: `unit/login-identity-policy.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-043 | COMPLETADA | Controlador/DTO lookup: `contract/login-identity.contract.spec.ts`; `unit/http-adapters.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-044 | PARCIAL | Checkpoint US2/Swagger: `contract/login-identity.contract.spec.ts`; `interfaces/openapi/login-identity.openapi.ts`; `scripts/validate-users-openapi.mjs` | Falta revisión semántica/drift del paso 2. |
| USR-045 | COMPLETADA | Contrato perfil/foto: `contract/profile.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-046 | COMPLETADA | Validación perfil/null: `unit/profile-validation.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-047 | COMPLETADA | Update optimista/atomicidad/correo: `integration/profile-update.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-048 | COMPLETADA | Foto/límite/rollback: `integration/profile-photo.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-049 | COMPLETADA | Modelo foto: `prisma/schema.prisma`; `integration/profile-photo.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-050 | COMPLETADA | Migración foto: `prisma/migrations/202609280002_add_profile_photo/migration.sql`; `integration/migrations-health.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-051 | COMPLETADA | Política perfil: `unit/profile-validation.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-052 | COMPLETADA | Magic bytes/digest/streaming: `unit/photo-policy.spec.ts`; `integration/profile-photo.spec.ts`; `contract/profile.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-053 | COMPLETADA | Repositorio transaccional perfil: `integration/profile-update.spec.ts`; `integration/profile-photo.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-054 | COMPLETADA | Casos de uso perfil/foto: `unit/http-adapters.spec.ts`; `contract/profile.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-055 | COMPLETADA | DTO perfil cerrado: `unit/profile-validation.spec.ts`; `integration/profile-restricted-fields.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-056 | COMPLETADA | Multipart: `unit/http-adapters.spec.ts`; `contract/profile.contract.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-057 | COMPLETADA | Controladores perfil/foto: `contract/profile.contract.spec.ts`; `integration/profile-ownership.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-058 | COMPLETADA | Mapeo errores perfil centralizado: `interfaces/http/problem.mapper.ts`; `integration/profile-update.spec.ts`; `integration/profile-photo.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-059 | PARCIAL | Swagger perfil/foto: `interfaces/openapi/profile.openapi.ts`; `contract/profile.contract.spec.ts`; `scripts/validate-users-openapi.mjs` | Falta revisión semántica/drift del paso 2. |
| USR-060 | COMPLETADA | Checkpoint US3: `mapeo exacto US3 en validation-report.md`; `23 suites/142 pruebas comunicadas` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-061 | COMPLETADA | JWT adversarial: `security/jwt-hardening.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-062 | COMPLETADA | Ownership unitario: `unit/profile-authorization.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-063 | COMPLETADA | Ownership PostgreSQL/no divulgación: `integration/profile-ownership.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-064 | COMPLETADA | Mass assignment/rollback: `integration/profile-restricted-fields.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-065 | COMPLETADA | RS256/claims endurecidos: `security/jwt-hardening.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-066 | COMPLETADA | Guard ownership: `unit/profile-authorization.spec.ts`; `integration/profile-ownership.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-067 | COMPLETADA | Guard/metadata roles sin endpoint productivo: `unit/roles.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-068 | COMPLETADA | DTO/parser restringidos: `integration/profile-restricted-fields.spec.ts`; `unit/http-adapters.spec.ts` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |
| USR-069 | PARCIAL | Orden auth/autorización/contrato: `security/jwt-hardening.spec.ts`; `integration/profile-ownership.spec.ts`; `interfaces/openapi/profile.openapi.ts` | Falta revisión semántica/drift del paso 2. |
| USR-070 | COMPLETADA | Checkpoint US4: `mapeo exacto US4 en validation-report.md`; `23 suites/142 pruebas comunicadas` | Rutas verificadas; suite/archivo citado; resultados del usuario, no reejecutados. |

## Bloque contractual y CI revisado

Validador OpenAPI ejecutado: exit 0. Comparación semántica 66d539c→fb18495 sin
pérdida de paths, seguridad ni restricciones; se conservan 401/403 y los cambios
de Problem Details. Sin cambios/reversiones al contrato. Límite: 5.000.000 bytes,
no 5 MiB. CI conserva gates unitario y combinado de 70%; ejecución remota pendiente.
Detalles en validation-report.md. La marcación única se consolidará tras Compose.

## Bloque de entrega provider

Se añadieron `test/fixtures/consumer-handoff.fixture.ts`, instrucciones de entrega
`test/fixtures/CONSUMER-HANDOFF.md` y `test/contract/users-provider.contract.spec.ts`.
La prueba conecta registro/replay/activación/cambio de correo/lookup y cancelación
directamente en Users. Sus dos casos pasaron en ejecución dirigida tras corregir
el envío multipart de la prueba nueva; no demuestra
Auth ni Gateway reales. USR-071–074/077 conservan sus dependencias externas.

## Bloque Compose verificado

Primer arranque exitoso del proyecto aislado `stayhub-users-g2-validation` con
secretos temporales externos al repositorio. Prisma generate y build exitosos;
dos migraciones aplicadas, job exit 0 antes del inicio del servicio, readiness 200,
servicio healthy como `node`, red interna y puerto 3002 sin publicar. Quedan
pendientes únicamente la integración conjunta de G1/G3 y demás cierres externos.
El build informó vulnerabilidades de dependencias; detalle en validation-report.md.

## Hallazgo: aliases de errores sin uso

`application/errors/users-errors.ts` reexporta DomainError como UsersError;
`registration-error.mapper.ts` y `profile-error.mapper.ts` reexportan mapProblem.
La búsqueda de referencias en src (excluyendo generated) no encontró consumidores
de esos tres aliases. Su 0% de cobertura corresponde a exports sin uso.
USR-035 y USR-058 funcionan realmente mediante
`interfaces/http/problem.filter.ts` → `interfaces/http/problem.mapper.ts`,
que distingue EMAIL_CONFLICT/VERSION_CONFLICT y mapea 400/401/403/404/409/413/415/503.
Se conservan los archivos; no se añaden pruebas artificiales para cubrir reexports.
