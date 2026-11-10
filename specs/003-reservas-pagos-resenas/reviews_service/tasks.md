# Tasks: reviews-service — Sprint 3

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` y `quickstart.md` de esta feature.  
**Trazabilidad**: RQ-11 principal; contribución parcial a RQ-06; REV-FR-001–012; REV-NFR-001–007.  
**Tests**: obligatorios por la constitución y la especificación; se escriben primero y deben fallar por la conducta ausente.  
**Límite**: no implementar frontend, Bookings, Gateway, Users, Accommodations, moderación, edición/eliminación, Redis ni RabbitMQ dentro de estas tareas.

## Formato

- `[P]`: ejecutable en paralelo porque usa archivos distintos y no depende de una tarea incompleta.
- `[USn]`: historia de `spec.md`.
- Una dependencia externa permite avanzar con puertos/stubs, pero impide marcar la integración real como terminada.

## Phase 1: Setup

**Purpose**: registrar `reviews-service` en el monorepo y preparar una base compilable sin lógica funcional.

- [x] T001 Crear `apps/reviews-service/package.json`, `apps/reviews-service/tsconfig.json` y `apps/reviews-service/tsconfig.build.json` con Node `>=20 <21`, NestJS 10.4, TypeScript 5.7, Prisma 6.19, Jest 29 y scripts build/lint/typecheck/test/migrate
- [x] T002 Registrar `apps/reviews-service`, scripts `build|lint|typecheck|test|prisma:reviews:*`, proyecto Nest y aliases `@reviews/*` en `package.json`, `nest-cli.json` y `tsconfig.base.json`
- [x] T003 [P] Configurar ESLint y fronteras de capas que prohíban imports Nest/Prisma/HTTP desde `apps/reviews-service/src/domain/` en `apps/reviews-service/eslint.config.mjs`
- [x] T004 [P] Configurar proyectos Jest `unit|integration|contract|security|concurrency|performance|e2e` y cobertura global mínima 70 % en `apps/reviews-service/jest.config.ts`
- [x] T005 [P] Crear `.env.example` sin secretos con puerto 3007, DB, JWT usuario/Gateway, Bookings URL/timeout, token file, shutdown, logs y OTEL en `apps/reviews-service/.env.example`
- [x] T006 [P] Crear imagen multi-stage Node 20 no-root, target de migración, healthcheck y dockerignore en `infra/docker/reviews/Dockerfile` y `infra/docker/reviews/Dockerfile.dockerignore`
- [x] T007 [P] Crear bootstrap mínimo y composición vacía en `apps/reviews-service/src/main.ts` y `apps/reviews-service/src/app.module.ts`
- [x] T008 [P] Crear Compose aislado con `reviews-db`, `reviews-migrate`, `reviews-service`, secrets, red interna y healthchecks en `docker-compose.reviews.yml`
- [x] T009 [P] Crear README operativo con alcance RQ-11/RQ-06 parcial, puerto 3007, comandos, contratos y límites de evidencia en `apps/reviews-service/README.md`
- [x] T010 Regenerar `package-lock.json`, instalar workspace y generar Prisma verificando que Auth, Users, Search y Bookings conservan build/typecheck en `package-lock.json`

**Checkpoint**: workspace reconocido, dependencias reproducibles y proyecto vacío compilable.

---

## Phase 2: Foundational — bloquea todas las historias

**Purpose**: dominio compartido, persistencia, seguridad, HTTP, contratos y operación requeridos por US1–US3.

**CRITICAL**: ninguna historia se implementa hasta completar esta fase.

- [x] T011 [P] Escribir pruebas fallidas de configuración obligatoria, secretos `_FILE`, puerto fijo 3007, URLs HTTP(S), JSON de claves, Bookings timeout, token file, shutdown y OTEL en `apps/reviews-service/test/unit/reviews-config.spec.ts`
- [x] T012 Implementar configuración tipada fail-fast y módulo global sin defaults productivos de secretos en `apps/reviews-service/src/infrastructure/config/reviews-config.ts` y `apps/reviews-service/src/infrastructure/config/config.module.ts` (depends on T011)
- [x] T013 [P] Escribir pruebas fallidas de `Rating` entero 1..5 y `ReviewComment` Unicode con trim en extremos, longitud 1..2.000, sin conversión ni sanitización destructiva, en `apps/reviews-service/test/unit/review-values.spec.ts`
- [x] T014 Implementar errores puros, `Rating`, `ReviewComment` y agregado inmutable `Review` con `id|bookingId|propertyId|guestId|rating|comment|createdAt` en `apps/reviews-service/src/domain/shared/domain-error.ts` y `apps/reviews-service/src/domain/reviews/` (depends on T013)
- [x] T015 [P] Escribir pruebas fallidas de migración para UUIDs, `bookingId` UNIQUE, CHECK `rating BETWEEN 1 AND 5`, comentario trim no vacío/máximo 2.000 e índices `(propertyId,createdAt DESC,id DESC)` y `(guestId,createdAt DESC,id DESC)` en `apps/reviews-service/test/integration/migrations-health.spec.ts`
- [x] T016 Modelar `Review` sin FK remotas, sin `updatedAt|deletedAt|status`, con tipos y mappings exactos de `data-model.md` en `apps/reviews-service/prisma/schema.prisma` (depends on T014–T015)
- [x] T017 Crear migración inicial reproducible con constraints e índices de T015 en `apps/reviews-service/prisma/migrations/001_reviews_core/migration.sql` y lock PostgreSQL en `apps/reviews-service/prisma/migrations/migration_lock.toml` (depends on T016)
- [x] T018 [P] Definir tokens y puertos `ReviewRepository`, `ReviewUnitOfWork`, `StayEligibilityPort`, `ServiceTokenPort`, `ClockPort` e `IdGeneratorPort` sin imports de infraestructura en `apps/reviews-service/src/application/ports/`
- [x] T019 Implementar Prisma lifecycle, readiness y módulo DI en `apps/reviews-service/src/infrastructure/persistence/prisma/prisma.service.ts` y `apps/reviews-service/src/infrastructure/persistence/prisma/prisma.module.ts` (depends on T016–T018)
- [x] T020 [P] Escribir pruebas adversariales para bearer de usuario y service JWT de Gateway: RS256, kid, iss, aud, iat, exp, sub/sid/jti UUID, role/scope, Authorization duplicado y spoofing en `apps/reviews-service/test/security/reviews-auth.spec.ts`
- [x] T021 Implementar verificadores separados y guards para access bearer de usuario y service JWT del Gateway en `apps/reviews-service/src/infrastructure/security/user-jwt.verifier.ts`, `apps/reviews-service/src/infrastructure/security/service-jwt.verifier.ts` y `apps/reviews-service/src/interfaces/http/guards/` (depends on T012,T020)
- [x] T022 [P] Implementar `EnvironmentServiceTokenProvider` que lee `REVIEWS_BOOKINGS_SERVICE_TOKEN_FILE` o fallback local no productivo, sin generar ni registrar JWT, en `apps/reviews-service/src/infrastructure/security/environment-service-token.provider.ts` (depends on T018)
- [x] T023 [P] Escribir pruebas fallidas de DTO cerrado, UUID/paginación, Problem Details y precedencia 401→403→404/409 en `apps/reviews-service/test/unit/http-adapters.spec.ts`
- [x] T024 Implementar validation pipe con whitelist/forbidUnknown, Problem mapper/filter, extracción segura de bearer y trace interceptor en `apps/reviews-service/src/interfaces/http/validation.pipe.ts`, `apps/reviews-service/src/interfaces/http/problem.filter.ts`, `apps/reviews-service/src/interfaces/http/auth/` y `apps/reviews-service/src/interfaces/http/trace.interceptor.ts` (depends on T023)
- [x] T025 [P] Implementar logger JSON con redacción, métricas base y OpenTelemetry sin JWT, comentario completo, payload remoto ni PII en `apps/reviews-service/src/infrastructure/observability/reviews-logger.ts`, `apps/reviews-service/src/infrastructure/observability/reviews-metrics.ts` y `apps/reviews-service/src/infrastructure/observability/otel.ts`
- [x] T026 [P] Escribir pruebas fallidas de `/health/live`, `/health/ready`, DB/migraciones obligatorias y reporte explícito de Bookings sin bypass en `apps/reviews-service/test/contract/health.contract.spec.ts` y `apps/reviews-service/test/integration/runtime-health.spec.ts`
- [x] T027 Implementar health module y controllers con liveness independiente y readiness de configuración/DB/migraciones en `apps/reviews-service/src/modules/health/health.controller.ts` y `apps/reviews-service/src/modules/health/health.module.ts` (depends on T019,T026)
- [x] T028 [P] Escribir validación sintáctica OpenAPI 3.1 y schemas cerrados para ambos archivos de `specs/003-reservas-pagos-resenas/reviews_service/contracts/` en `apps/reviews-service/test/contract/design-contracts.spec.ts`
- [x] T029 [P] Crear pruebas de arquitectura que impidan imports de otros microservicios y dependencias Nest/Prisma/HTTP en dominio/aplicación pura en `apps/reviews-service/test/unit/reviews-layer-structure.spec.ts` y `apps/reviews-service/test/unit/no-cross-service-imports.spec.ts`
- [x] T030 Integrar Config, Prisma, seguridad, HTTP, observabilidad y Health en `apps/reviews-service/src/app.module.ts` y `apps/reviews-service/src/main.ts` (depends on T012,T019,T021–T029)

**Checkpoint**: foundation lista; US1–US3 pueden dividirse respetando sus dependencias.

---

## Phase 3: US1 — Crear reseña tras estadía completada (P1) 🎯 MVP

**Goal**: un GUEST crea exactamente una reseña válida para una reserva propia `COMPLETED`, derivando `propertyId` de Bookings y fallando cerrado.

**Independent Test**: con Bookings stub y PostgreSQL real, una respuesta elegible produce 201/una fila; estados no elegibles, IDs distintos, fallo externo, rol inválido y concurrencia no crean filas adicionales.

### Tests for US1 — escribir primero

- [x] T031 [P] [US1] Escribir pruebas unitarias fallidas de `CreateReviewUseCase` para elegible, `eligible=false`, mismatch de booking/guest, rol no GUEST, duplicado y dependencia caída en `apps/reviews-service/test/unit/create-review.use-case.spec.ts`
- [x] T032 [P] [US1] Escribir contrato fallido de `POST /internal/v1/reviews` para body exacto `bookingId UUID`, `rating` entero 1..5, `comment` trim 1..2.000, 201/400/401/403/404/409/503 y respuesta sin guestId/bookingId en `apps/reviews-service/test/contract/create-review.contract.spec.ts`
- [x] T033 [P] [US1] Escribir consumer contract fallido contra el handoff terminado de Bookings que verifique ruta, `guestId` obligatorio, respuesta positiva exacta `bookingId|guestId|propertyId|eligible`, scope `reviews:eligibility` y audience configurada en `apps/reviews-service/test/contract/bookings-eligibility.consumer.spec.ts` (provider: `apps/bookings-service/test/fixtures/REVIEWS-HANDOFF.md` y `specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-bookings-service.yaml`)
- [x] T034 [P] [US1] Escribir integración fallida del cliente Bookings contra stub para 200 elegible, 400, 401, 404 no divulgativo, timeout/5xx, JSON inválido y mismatch de IDs en `apps/reviews-service/test/integration/bookings-eligibility.client.spec.ts`
- [x] T035 [P] [US1] Escribir integración fallida en PostgreSQL real para inserción, mapping, `bookingId` UNIQUE y traducción segura de constraint en `apps/reviews-service/test/integration/create-review-persistence.spec.ts`
- [x] T036 [P] [US1] Escribir prueba fallida de dos creaciones simultáneas del mismo `bookingId` que exija exactamente una fila y un `REVIEW_ALREADY_EXISTS` en `apps/reviews-service/test/concurrency/review-uniqueness.spec.ts`
- [x] T037 [P] [US1] Escribir pruebas de seguridad fallidas para JWT ausente/inválido, OWNER/ADMIN, body/header con guestId/propertyId, SQL injection, comentario hostil y redacción de logs en `apps/reviews-service/test/security/create-review-security.spec.ts`

### Implementation for US1

- [x] T038 [P] [US1] Implementar DTO cerrado que acepte solo `bookingId UUID`, `rating` entero 1..5 y `comment` string trim 1..2.000 en `apps/reviews-service/src/interfaces/http/dto/create-review.dto.ts` (depends on T032)
- [x] T039 [P] [US1] Implementar tipos/mapper de `ReviewEligibility` que exijan `bookingId|guestId|propertyId` UUID, `eligible` boolean y coincidencia exacta con el comando/principal en `apps/reviews-service/src/infrastructure/http/bookings-eligibility.mapper.ts` (depends on T033–T034)
- [x] T040 [US1] Implementar cliente REST de Bookings con token de `ServiceTokenPort`, URL codificada, timeout, propagación `x-request-id` y fail-closed: mapear 404 a reserva no elegible/no encontrada y traducir 400/401 internos, timeout, 5xx, respuesta inválida o mismatch a dependencia/configuración no disponible sin convertirlos en 401 del usuario en `apps/reviews-service/src/infrastructure/http/bookings-review-eligibility.client.ts` (depends on T012,T018,T022,T039; provider disponible mediante Bookings T080,T085–T088)
- [x] T041 [P] [US1] Implementar repositorio/UoW Prisma para crear Review y mapear la unicidad de `bookingId` a `REVIEW_ALREADY_EXISTS` sin filtrar SQL en `apps/reviews-service/src/infrastructure/persistence/prisma/review.repository.ts` y `apps/reviews-service/src/infrastructure/persistence/prisma/review.unit-of-work.ts` (depends on T017–T019,T035–T036)
- [x] T042 [US1] Implementar `CreateReviewUseCase` que toma guestId/rol del principal, valida Bookings antes de abrir transacción, deriva propertyId, crea Review y falla cerrado en `apps/reviews-service/src/application/create-review/create-review.use-case.ts` (depends on T014,T018,T031,T040–T041)
- [x] T043 [US1] Implementar controller, presenter seguro y composición del módulo para `POST /internal/v1/reviews` con user bearer y rol GUEST en `apps/reviews-service/src/interfaces/http/reviews/reviews.controller.ts`, `apps/reviews-service/src/interfaces/http/reviews/review.presenter.ts` y `apps/reviews-service/src/modules/reviews/reviews.module.ts` (depends on T021,T024,T038,T042)
- [x] T044 [US1] Generar decoradores/Swagger de creación y prueba de drift contra `openapi-reviews-service.yaml` en `apps/reviews-service/src/interfaces/openapi/reviews.openapi.ts` y `apps/reviews-service/test/contract/openapi-drift.spec.ts` (depends on T028,T043)
- [x] T045 [US1] Ejecutar y estabilizar T031–T037 demostrando RQ-11 aislado con Bookings stub, PostgreSQL real, cero duplicados y cero acceso a bases ajenas en `apps/reviews-service/test/{unit,integration,contract,security,concurrency}/` (depends on T038–T044)

**Checkpoint**: MVP de RQ-11 funciona de forma aislada; no se declara integración real con Bookings hasta su handoff.

---

## Phase 4: US2 — Consultar reseñas de una propiedad (P1)

**Goal**: devolver una página pública estable de reseñas de una propiedad sin consultar Accommodations ni exponer guestId/bookingId.

**Independent Test**: fixtures locales producen orden `createdAt DESC,id DESC`, paginación 1..100, lista vacía válida y DTO exacto sin identificadores privados.

### Tests for US2 — escribir primero

- [x] T046 [P] [US2] Escribir pruebas unitarias fallidas de query/paginación y presenter que nunca exponga `guestId|bookingId` en `apps/reviews-service/test/unit/list-property-reviews.use-case.spec.ts` y `apps/reviews-service/test/unit/review-presenter.spec.ts`
- [x] T047 [P] [US2] Escribir contrato fallido de `GET /internal/v1/properties/{propertyId}/reviews` con service JWT, UUID, page >=1, pageSize 1..100, 200/400/401/403 y `ReviewPage` cerrado en `apps/reviews-service/test/contract/property-reviews.contract.spec.ts`
- [x] T048 [P] [US2] Escribir integración fallida de repositorio para filtro exclusivo por propertyId, lista vacía, total/totalPages y orden `createdAt DESC,id DESC` en `apps/reviews-service/test/integration/property-reviews.repository.spec.ts`
- [x] T049 [P] [US2] Escribir seguridad fallida para token de servicio ausente, issuer/audience/scope incorrectos, UUID malicioso y ausencia de PII en `apps/reviews-service/test/security/property-reviews-security.spec.ts`

### Implementation for US2

- [x] T050 [P] [US2] Implementar query/parser común de página con `page >=1`, `pageSize 1..100`, defaults 1/20 y respuesta `items|page|pageSize|total|totalPages` en `apps/reviews-service/src/domain/reviews/review-page.ts` y `apps/reviews-service/src/interfaces/http/dto/review-page.dto.ts` (depends on T046–T047)
- [x] T051 [US2] Extender `ReviewRepository`/Prisma con lectura por propertyId e índices del modelo, sin llamada a Accommodations, en `apps/reviews-service/src/application/ports/review.repository.ts` y `apps/reviews-service/src/infrastructure/persistence/prisma/review.repository.ts` (depends on T048,T050)
- [x] T052 [US2] Implementar `ListPropertyReviewsUseCase` y controller protegido por service JWT en `apps/reviews-service/src/application/list-property-reviews/list-property-reviews.use-case.ts` y `apps/reviews-service/src/interfaces/http/reviews/property-reviews.controller.ts` (depends on T021,T024,T046,T049–T051)
- [x] T053 [US2] Sincronizar Swagger de consulta por propiedad y ejecutar drift de schema/paginación en `apps/reviews-service/src/interfaces/openapi/property-reviews.openapi.ts` y `apps/reviews-service/test/contract/openapi-drift.spec.ts` (depends on T047,T052)
- [x] T054 [US2] Ejecutar y estabilizar T046–T049 demostrando contribución parcial a RQ-06, lista vacía y cero PII/dependencia Accommodations en `apps/reviews-service/test/{unit,integration,contract,security}/` (depends on T050–T053)

**Checkpoint**: US2 es consultable de forma independiente sobre proyección local y no declara RQ-06 completo.

---

## Phase 5: US3 — Consultar reseñas propias (P2)

**Goal**: un usuario autenticado lista únicamente sus reseñas con paginación estable.

**Independent Test**: `sub == userId` obtiene su página; `sub != userId` recibe 403 antes de consultar la DB y no se revela existencia de otro usuario.

### Tests for US3 — escribir primero

- [x] T055 [P] [US3] Escribir pruebas unitarias fallidas de ownership `principal.sub === path.userId`, paginación y proyección segura en `apps/reviews-service/test/unit/list-own-reviews.use-case.spec.ts`
- [x] T056 [P] [US3] Escribir contrato fallido de `GET /internal/v1/reviews/user/{userId}` con user bearer, UUID, page/pageSize, 200/400/401/403 y `ReviewPage` cerrado en `apps/reviews-service/test/contract/user-reviews.contract.spec.ts`
- [x] T057 [P] [US3] Escribir integración fallida de repositorio para filtro exclusivo por guestId, total y orden estable en `apps/reviews-service/test/integration/user-reviews.repository.spec.ts`
- [x] T058 [P] [US3] Escribir seguridad fallida para bearer inválido, historial ajeno, ADMIN sin capacidad nueva, header spoofing y precedencia 401/403 antes de DB en `apps/reviews-service/test/security/user-reviews-security.spec.ts`

### Implementation for US3

- [x] T059 [US3] Extender `ReviewRepository`/Prisma con lectura por guestId y paginación común en `apps/reviews-service/src/application/ports/review.repository.ts` y `apps/reviews-service/src/infrastructure/persistence/prisma/review.repository.ts` (depends on T050,T057)
- [x] T060 [US3] Implementar política de ownership y `ListOwnReviewsUseCase` sin consultar Users en `apps/reviews-service/src/domain/reviews/review-ownership.policy.ts` y `apps/reviews-service/src/application/list-user-reviews/list-own-reviews.use-case.ts` (depends on T055,T059)
- [x] T061 [US3] Implementar controller con user bearer y presenter compartido para historial propio en `apps/reviews-service/src/interfaces/http/reviews/user-reviews.controller.ts` y `apps/reviews-service/src/modules/reviews/reviews.module.ts` (depends on T021,T024,T056,T058,T060)
- [x] T062 [US3] Sincronizar Swagger y ejecutar T055–T058 demostrando ownership, paginación y no divulgación en `apps/reviews-service/src/interfaces/openapi/user-reviews.openapi.ts` y `apps/reviews-service/test/{unit,integration,contract,security}/` (depends on T061)

**Checkpoint**: las tres historias son funcionales e independientemente verificables.

---

## Phase 6: Polish, integración y gates transversales

**Purpose**: integrar infraestructura, ejecutar evidencia distribuida disponible y cerrar calidad sin ampliar alcance.

- [x] T063 [P] Añadir `reviews-db`, `reviews-migrate`, `reviews-service`, secrets, redes y healthchecks al Compose raíz sin modificar responsabilidad de Bookings en `docker-compose.yml` y `.env.example`
- [x] T064 [P] Añadir gates Reviews build/lint/typecheck/unit/integration/contract/security/concurrency/performance/OpenAPI/imagen en `.github/workflows/ci.yml`
- [x] T065 [P] Implementar validador OpenAPI y drift generado↔fuente para ambos contratos en `scripts/validate-reviews-contracts.mjs` y `apps/reviews-service/test/contract/openapi-drift.spec.ts`
- [x] T066 [P] Crear dataset reproducible y gate p95 <500 ms/error inesperado <1 % para consultas por propiedad/usuario en `apps/reviews-service/test/fixtures/performance-dataset.ts` y `apps/reviews-service/test/performance/reviews-performance.spec.ts`
- [x] T067 [P] Ejecutar hardening transversal de JWT, spoofing, DTO cerrado, SQL injection, contenido hostil, PII/log redaction y códigos seguros en `apps/reviews-service/test/security/reviews-security.spec.ts`
- [x] T068 Crear E2E aislado bearer→Reviews→Bookings stub→PostgreSQL para creación, duplicado y consultas, sin RabbitMQ/Redis, en `apps/reviews-service/test/e2e/reviews-isolated.e2e-spec.ts` (depends on T045,T054,T062)
- [x] T069 Ejecutar consumer/provider y E2E real Reviews↔Bookings usando solo eligibility REST, el handoff versionado y service JWT con scope `reviews:eligibility`, sin importar código ni consultar `bookings_db`, en `apps/reviews-service/test/contract/bookings-provider.contract.spec.ts` y `apps/reviews-service/test/e2e/bookings-reviews.e2e-spec.ts` (depends on T033,T068; coordination dependency: Bookings T098)
- [ ] T070 Ejecutar integración Gateway↔Reviews para rutas públicas, bearer/service JWT, ownership, rate limit y Problem Details en `apps/reviews-service/test/e2e/gateway-reviews.e2e-spec.ts` (depends on T068; external dependency: routing/contratos del API Gateway)
- [x] T071 [P] Implementar shutdown ordenado y probar SIGTERM, no-root, filesystem read-only, secrets y readiness en `apps/reviews-service/src/infrastructure/lifecycle/graceful-shutdown.ts` y `apps/reviews-service/test/contract/shutdown.contract.spec.ts`
- [x] T072 Ejecutar todos los escenarios de `quickstart.md` y registrar comandos/exit codes/evidencia, distinguiendo stub de integración real, en `specs/003-reservas-pagos-resenas/reviews_service/quickstart.md` (depends on T063–T071)
- [x] T073 Actualizar README final con contratos, migraciones, seguridad, operación, límites RQ-06 parcial y gates externos en `apps/reviews-service/README.md` (depends on T072)
- [x] T074 Auditar trazabilidad RQ-11/RQ-06 parcial, cobertura >=70 %, p95, contratos, Compose, CI, revisión humana y dependencias no simuladas en `specs/003-reservas-pagos-resenas/reviews_service/validation-report.md` (depends on T072–T073)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup**: sin dependencias.
- **Phase 2 Foundational**: depende de Phase 1 y bloquea las tres historias.
- **US1**: inicia tras Foundation; es el MVP y crea el agregado/repositorio base.
- **US2**: inicia tras Foundation y puede trabajar con fixtures; T051 reutiliza el repositorio base de US1.
- **US3**: inicia tras Foundation; reutiliza paginación de US2 y repositorio base.
- **Phase 6**: integra únicamente historias terminadas y colaboradores disponibles.

### External dependency gates

| Gate | Trabajo que puede avanzar | Tarea que no cierra sin externo |
|---|---|---|
| Bookings T079–T088 completadas | T031–T045 con stub y handoff versionado | T069 puede usar el provider real |
| Bookings T098 | Consumer y E2E aislado de Reviews | Cierre coordinado de T069/T098 |
| API Gateway | Controllers y E2E aislado directo | T070 |
| Compose conjunto | Compose aislado/imagen Reviews | T072–T074 para evidencia distribuida completa |

### User-story order

```text
Setup → Foundation
             ├── US1 Crear reseña (MVP)
             ├── US2 Listar por propiedad
             └── US3 Historial propio

US1 + US2 + US3 → Polish/integración
Bookings T079–T088 (listas) ───┘ (habilitan T069 real)
Gateway routing ───────────────┘ (solo T070 real)
```

### Within each story

1. Escribir pruebas y confirmar fallo por conducta ausente.
2. Implementar valores/DTOs/adaptadores.
3. Implementar caso de uso.
4. Exponer controller/OpenAPI.
5. Ejecutar checkpoint independiente.

## Parallel Opportunities

- Phase 1: T003–T009 después de fijar nombres en T001–T002.
- Foundation: T011, T013, T015, T018, T020, T023, T025, T026, T028 y T029 usan archivos independientes.
- US1: T031–T037 pueden escribirse en paralelo; T038, T039 y T041 pueden avanzar tras sus pruebas.
- US2: T046–T049 son paralelas; T050 y el diseño de repositorio pueden avanzar por separado.
- US3: T055–T058 son paralelas.
- Phase 6: T063–T067 y T071 son independientes; T069/T070 esperan colaboradores externos.

## Parallel Example: US1

```text
Developer A: T031 → T042 (caso de uso/dominio)
Developer B: T032 + T038 + T043–T044 (HTTP/OpenAPI)
Developer C: T033–T034 + T039–T040 (contrato/cliente Bookings)
Developer D: T035–T036 + T041 (PostgreSQL/concurrencia)
Todos: T045 checkpoint US1
```

## Implementation Strategy

### MVP First

1. Completar T001–T030.
2. Completar T031–T045.
3. Detenerse y validar US1 con Bookings stub y PostgreSQL real.
4. Usar desde T033 el handoff terminado de Bookings T079–T088; reservar T069 para la integración real coordinada con Bookings T098.

### Incremental Delivery

1. Foundation reproducible.
2. US1: creación segura y única.
3. US2: lectura pública por propiedad, contribución parcial RQ-06.
4. US3: historial propio.
5. Cierre con contracts, performance, Compose y externos disponibles.

## Review of current Bookings state

- Bookings tiene implementados el lifecycle/check-out, `GetReviewEligibilityUseCase`, controller interno, guard con scope/audience separado, fixture `REVIEWS-HANDOFF` y provider contract correspondientes a T079–T088.
- El provider devuelve 200 únicamente para una reserva del huésped en estado `COMPLETED`; reserva inexistente, ajena o no completada responde 404 sin divulgación, y credenciales de servicio inválidas responden 401.
- T033 consume el handoff versionado y valida compatibilidad sin exigir `eligible=false` ni un 403 directo que el provider actual no emite; T034/T040 prueban y traducen fallos de red/5xx de forma fail-closed.
- El patrón saliente real usa `EnvironmentServiceTokenProvider` y token montado por archivo; T022/T040 lo reutilizan sin compartir imports.
- Ninguna tarea de Reviews modifica archivos de Bookings. T069 y Bookings T098 cierran conjuntamente la evidencia distribuida real.

## Notes

- T001–T069 y T071–T074 están completadas; el routing y E2E Gateway↔Reviews ya aprobaron con ambos
  servicios reales y PostgreSQL 16. T070 permanece `[ ]` solo porque exige rate limit y el spec no
  define una cuota que pueda implementarse sin inventar un requisito.
- `[P]` solo aparece cuando archivos y dependencias permiten ejecución independiente.
- Cada tarea funcional contiene `[USn]` y ruta concreta.
- No marcar T069/T070/T074 como evidencia real si se ejecutaron únicamente con stubs.
- No añadir RabbitMQ, Redis, edición, eliminación o moderación sin cambio aprobado de spec/plan.
