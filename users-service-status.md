# Estado de users-service — Grupo 2

## Revisión acotada JWT y dependencias — 2026-09-29

Punto 1 (USR-015/061/065): la premisa de validación ausente no se reprodujo.
`jwt.strategy.ts:16` ya delega en `verifyJwt`; el verificador exige kid coincidente
y exp/iat enteros presentes. La configuración ya exige USERS_JWT_KID, documentado
en .env.example/README, y el helper ya firma con kid/iat. La búsqueda inicial
en jwt-hardening encontró kid incorrecto; se añadieron cuatro casos explícitos
(kid incorrecto/ausente, exp ausente, iat ausente), todos con 401 y cero llamadas
al repositorio. Pasaron antes de modificar producción: no hay fase roja por
conducta ausente ni se duplican controles existentes para aparentar una corrección.

Comando ejecutado: `npm test --workspace @stayhub/users-service -- --runTestsByPath
test/security/jwt-hardening.spec.ts test/integration/profile-ownership.spec.ts
test/contract/profile.contract.spec.ts test/unit/profile-authorization.spec.ts`.
Resultado: **4 suites, 24 pruebas verdes**, con USERS_TEST_DATABASE_URL apuntando
a PostgreSQL de pruebas en 127.0.0.1:55432/users_db. Sin Docker ni suite completa.

Punto 2 (USR-035/058): los archivos indicados en `in path`,
`interfaces/http/internal/registration-error.mapper.ts` y
`interfaces/http/profiles/profile-error.mapper.ts`, son aliases de
`interfaces/http/problem.mapper.ts`. El mapeo efectivo lo aplica
`interfaces/http/problem.filter.ts`. Se mantienen las [X]; no cambia código.

Rama: `feat/users-perfil-authz`. Checkpoint WIP conservado: `fb18495`.

## Verificado por el usuario, no reejecutado

- Lint y typecheck sin errores; 23 suites y 142 pruebas verdes.
- Cobertura combinada: 96,15% sentencias, 89,95% ramas, 95,23% funciones,
  98,05% líneas; umbral 70% cumplido.
- Docker multi-stage correcto, usuario `node`, healthcheck `/health/ready`;
  Compose válido y puerto 3002 no publicado.
- Existen Dockerfile, Compose, CI, validador OpenAPI y las dos migraciones.
- P2028 resuelto con `127.0.0.1`; no ajustar timeouts ni profile.repository.ts.

## Resultado de esta continuación

USR-001–070: COMPLETADA, marcadas en un único commit del backlog Users.
USR-071/072/073/077: BLOQUEADA por consumidores reales G1/G3.
USR-074/075/076/078: PARCIAL; parte Users verificada, cierre externo pendiente.

Typecheck y OpenAPI finales: exit 0. Suite completa ejecutada una sola vez:
23 suites pasaron y falló la nueva suite provider por enviar JSON al PATCH
multipart (143/144 pruebas). Corregida la petición, la suite dirigida pasó sus
2 casos. No se repitió ni se declara verde el comando completo fallido.
Cobertura medida: 96,15% sentencias; 89,95% ramas; 95,23% funciones; 98,05% líneas.
Compose: migración exit 0 previa al servicio healthy, readiness 200, puerto 3002
sin publicar. Evidencia detallada en validation-report.md.

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
Las marcas se consolidaron en un único commit tras validar OpenAPI/CI y el
arranque Compose. Las suites originales también pasaron en la ejecución final.

| USR | Estado | Evidencia | Validación / falta |
|---|---|---|---|
| USR-001 | COMPLETADA | Workspace y scripts: `unit/http-adapters.spec.ts`; `package.json`; `nest-cli.json` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-002 | COMPLETADA | Bootstrap/capas: `unit/http-adapters.spec.ts`; `src/main.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-003 | COMPLETADA | Tipos estrictos y aliases: `tsconfig.base.json`; `apps/users-service/tsconfig.json`; `typecheck comunicado` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-004 | COMPLETADA | Jest, cuatro proyectos y umbral 70%: `jest.config.ts`; `23 suites comunicadas` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-005 | COMPLETADA | Variables Users documentadas: `.env.example`; `README.md`; `unit/config.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-006 | COMPLETADA | Prisma 6 PostgreSQL, cliente y comandos: `prisma/schema.prisma`; `package.json`; `integration/migrations-health.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-007 | COMPLETADA | Imagen multi-stage/no root/healthcheck: `infra/docker/users/Dockerfile`; `infra/docker/users/.dockerignore`; `Docker verificado por usuario` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-008 | COMPLETADA | `docker-compose.yml`; ejecución real aislada | Migración exit 0 antes del servicio healthy; readiness 200; red interna; 3002 no publicado. |
| USR-009 | COMPLETADA | `.github/workflows/ci.yml` | Etapas y gates unitario/combinado revisados; no acredita CI remota. |
| USR-010 | COMPLETADA | Configuración validada: `unit/config.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-011 | COMPLETADA | Prisma/lifecycle/users_db: `integration/migrations-health.spec.ts`; `integration/profile-update.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-012 | COMPLETADA | Validación/Problem Details: `unit/http-adapters.spec.ts`; `security/secret-leakage.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-013 | COMPLETADA | Trazas/logs/OTLP: `unit/telemetry.spec.ts`; `unit/http-adapters.spec.ts`; `security/secret-leakage.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-014 | COMPLETADA | Service JWT/scopes: `security/service-auth.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-015 | COMPLETADA | Passport RS256/claims: `security/jwt-hardening.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-016 | COMPLETADA | Puertos de repositorio/unidad de trabajo: `application/ports/{user.repository,profile.repository,unit-of-work}.ts`; `unit/http-adapters.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-017 | COMPLETADA | Errores dominio/aplicación: `domain/shared/domain-error.ts`; `application/errors/users-errors.ts`; `unit/http-adapters.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-018 | COMPLETADA | Live/ready y migraciones: `integration/migrations-health.spec.ts`; `unit/http-adapters.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-019 | COMPLETADA | Swagger interno: `unit/http-adapters.spec.ts`; `interfaces/openapi/openapi.factory.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-020 | COMPLETADA | Harness PostgreSQL/migraciones/rollback/fixtures: `integration/postgres.setup.ts`; `fixtures/users.fixture.ts`; `integration/migrations-health.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-021 | COMPLETADA | Composición base: `unit/http-adapters.spec.ts`; `src/app.module.ts`; `src/main.ts`; `docker-compose.yml` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-022 | COMPLETADA | Contrato registro: `contract/registration.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-023 | COMPLETADA | Políticas registro: `unit/registration-policy.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-024 | COMPLETADA | Concurrencia/índices: `integration/registration-concurrency.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-025 | COMPLETADA | Estados/replays: `integration/registration-state.spec.ts`; `integration/login-identity.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-026 | COMPLETADA | Service auth negativa: `security/service-auth.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-027 | COMPLETADA | Modelo User: `prisma/schema.prisma`; `integration/registration-concurrency.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-028 | COMPLETADA | Migración User: `prisma/migrations/202609280001_create_users/migration.sql`; `integration/migrations-health.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-029 | COMPLETADA | Value objects identidad: `unit/registration-policy.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-030 | COMPLETADA | Transiciones User: `unit/registration-policy.spec.ts`; `integration/registration-state.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-031 | COMPLETADA | Repositorio registro: `integration/registration-concurrency.spec.ts`; `integration/registration-state.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-032 | COMPLETADA | Casos de uso registro: `contract/registration.contract.spec.ts`; `unit/http-adapters.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-033 | COMPLETADA | DTO cerrado registro: `contract/registration.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-034 | COMPLETADA | Controladores registro: `contract/registration.contract.spec.ts`; `security/service-auth.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-035 | COMPLETADA | Mapeo errores registro centralizado: `interfaces/http/problem.mapper.ts`; `contract/registration.contract.spec.ts`; `unit/http-adapters.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-036 | COMPLETADA | Swagger registro/drift: `contract/registration.contract.spec.ts`; `interfaces/openapi/registration.openapi.ts`; `scripts/validate-users-openapi.mjs` | OpenAPI válido/sin drift; seguridad conservada; suites originales verdes. |
| USR-037 | COMPLETADA | Checkpoint US1: `mapeo exacto US1 en validation-report.md`; `23 suites/142 pruebas comunicadas` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-038 | COMPLETADA | Contrato lookup: `contract/login-identity.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-039 | COMPLETADA | Política lookup mínima: `unit/login-identity-policy.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-040 | COMPLETADA | Persistencia lookup/correo vigente: `integration/login-identity.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-041 | COMPLETADA | Repositorio lookup: `integration/login-identity.spec.ts`; `contract/login-identity.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-042 | COMPLETADA | Caso de uso lookup: `unit/login-identity-policy.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-043 | COMPLETADA | Controlador/DTO lookup: `contract/login-identity.contract.spec.ts`; `unit/http-adapters.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-044 | COMPLETADA | Checkpoint US2/Swagger: `contract/login-identity.contract.spec.ts`; `interfaces/openapi/login-identity.openapi.ts`; `scripts/validate-users-openapi.mjs` | OpenAPI válido/sin drift; seguridad conservada; suites originales verdes. |
| USR-045 | COMPLETADA | Contrato perfil/foto: `contract/profile.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-046 | COMPLETADA | Validación perfil/null: `unit/profile-validation.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-047 | COMPLETADA | Update optimista/atomicidad/correo: `integration/profile-update.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-048 | COMPLETADA | Foto/límite/rollback: `integration/profile-photo.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-049 | COMPLETADA | Modelo foto: `prisma/schema.prisma`; `integration/profile-photo.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-050 | COMPLETADA | Migración foto: `prisma/migrations/202609280002_add_profile_photo/migration.sql`; `integration/migrations-health.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-051 | COMPLETADA | Política perfil: `unit/profile-validation.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-052 | COMPLETADA | Magic bytes/digest/streaming: `unit/photo-policy.spec.ts`; `integration/profile-photo.spec.ts`; `contract/profile.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-053 | COMPLETADA | Repositorio transaccional perfil: `integration/profile-update.spec.ts`; `integration/profile-photo.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-054 | COMPLETADA | Casos de uso perfil/foto: `unit/http-adapters.spec.ts`; `contract/profile.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-055 | COMPLETADA | DTO perfil cerrado: `unit/profile-validation.spec.ts`; `integration/profile-restricted-fields.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-056 | COMPLETADA | Multipart: `unit/http-adapters.spec.ts`; `contract/profile.contract.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-057 | COMPLETADA | Controladores perfil/foto: `contract/profile.contract.spec.ts`; `integration/profile-ownership.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-058 | COMPLETADA | Mapeo errores perfil centralizado: `interfaces/http/problem.mapper.ts`; `integration/profile-update.spec.ts`; `integration/profile-photo.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-059 | COMPLETADA | Swagger perfil/foto: `interfaces/openapi/profile.openapi.ts`; `contract/profile.contract.spec.ts`; `scripts/validate-users-openapi.mjs` | OpenAPI válido/sin drift; seguridad conservada; suites originales verdes. |
| USR-060 | COMPLETADA | Checkpoint US3: `mapeo exacto US3 en validation-report.md`; `23 suites/142 pruebas comunicadas` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-061 | COMPLETADA | JWT adversarial: `security/jwt-hardening.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-062 | COMPLETADA | Ownership unitario: `unit/profile-authorization.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-063 | COMPLETADA | Ownership PostgreSQL/no divulgación: `integration/profile-ownership.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-064 | COMPLETADA | Mass assignment/rollback: `integration/profile-restricted-fields.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-065 | COMPLETADA | RS256/claims endurecidos: `security/jwt-hardening.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-066 | COMPLETADA | Guard ownership: `unit/profile-authorization.spec.ts`; `integration/profile-ownership.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-067 | COMPLETADA | Guard/metadata roles sin endpoint productivo: `unit/roles.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-068 | COMPLETADA | DTO/parser restringidos: `integration/profile-restricted-fields.spec.ts`; `unit/http-adapters.spec.ts` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |
| USR-069 | COMPLETADA | Orden auth/autorización/contrato: `security/jwt-hardening.spec.ts`; `integration/profile-ownership.spec.ts`; `interfaces/openapi/profile.openapi.ts` | OpenAPI válido/sin drift; seguridad conservada; suites originales verdes. |
| USR-070 | COMPLETADA | Checkpoint US4: `mapeo exacto US4 en validation-report.md`; `23 suites/142 pruebas comunicadas` | Rutas y evidencia verificadas; suite original verde en ejecución final cuando aplica. |

## Bloque contractual y CI revisado

Validador OpenAPI ejecutado: exit 0. Comparación semántica 66d539c→fb18495 sin
pérdida de paths, seguridad ni restricciones; se conservan 401/403 y los cambios
de Problem Details. Sin cambios/reversiones al contrato. Límite: 5.000.000 bytes,
no 5 MiB. CI conserva gates unitario y combinado de 70%; ejecución remota pendiente.
Detalles en validation-report.md. Marcación única consolidada tras Compose.

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

## USR-071–078: dependencias externas

| USR | Estado | Evidencia / resultado | Falta exacta |
|---|---|---|---|
| USR-071 | BLOQUEADA | Registro provider y nuevo flujo replay/activación/cancelación verdes | G3: orquestador real, service JWT, timeout/retry coordinado; falta auth-registration-consumer.spec.ts con consumidor real. |
| USR-072 | BLOQUEADA | Lookup ACTIVE y cambio de correo verificados directamente en Users | G3: consumidor lookup y login genérico real; falta auth-login-consumer.spec.ts. |
| USR-073 | BLOQUEADA | Suites perfil/foto/ownership y entrega multipart documentadas | G1: routing, introspección G3, stripping, bearer/trace, streaming y timeout reales; falta gateway-profile-consumer.spec.ts. |
| USR-074 | PARCIAL | users-provider.contract.spec.ts: 2 pruebas verdes; OpenAPI sin drift | G1/G3: expectativas aprobadas y ejecución conjunta provider/consumer. |
| USR-075 | PARCIAL | Compose G2 real healthy, job exit 0, secrets externos, puerto privado | G1: red/readiness conjunta; dependencias 071–073 sin completar. |
| USR-076 | PARCIAL | CI automatiza drift y secret-leakage; validador y security verdes | Cierre depende de 074; ejecución remota de CI pendiente. |
| USR-077 | BLOQUEADA | consumer-handoff.fixture.ts y CONSUMER-HANDOFF.md entregados | G1: E2E HTTPS real con Auth G3; falta users-evidence.spec.ts con evidencia conjunta. |
| USR-078 | PARCIAL | Typecheck, migraciones, Docker, cobertura, suites originales y provider verificados | CI remota, revisión independiente, cierre G1/G3 y auditoría de dependencias; no se reejecutó toda la suite tras corregir la nueva prueba. |

No se añadieron suites vacías ni se simularon Auth/Gateway. Las tareas externas
permanecen sin marcar. Las cifras históricas del checkpoint se mantienen
atribuidas al usuario y separadas de los comandos ejecutados aquí.
