# Tasks: Search Service de StayHub

**Input**: documentos de diseño en `specs/002-alojamientos-busqueda/search_service/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`  
**Scope**: exclusivamente `search-service`; no incluye frontend, API Gateway ni implementación de `accommodations-service`

## Trazabilidad

| Historia | Requisito fuente | Cobertura |
|---|---|---|
| **US1 - Búsqueda con filtros combinados (P1)** | RQ-04, SR-FR-001–006, SR-FR-010–012 | Cobertura principal de búsqueda sobre la proyección local; contribuye parcialmente a RQ-06 mediante el resumen y `accommodationId`. |
| **US2 - Sugerencias (P2)** | RQ-04, SR-FR-006–007, SR-FR-012 | Sugerencias no personalizadas de nombres y ubicaciones indexadas. |
| **US3 - Proyección idempotente (P2)** | Habilitador de RQ-04, SR-FR-008–010 | Mantiene el read model propio mediante eventos versionados; el productor real queda diferido. |
| **Transversal** | SR-NFR-001–007 | Rendimiento, seguridad, disponibilidad, portabilidad, mantenibilidad y contratos. |

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: puede ejecutarse en paralelo porque afecta archivos distintos y no depende de otra tarea incompleta de la fase.
- **[US1]**, **[US2]**, **[US3]**: historia a la que aporta la tarea.
- Las pruebas de cada historia se escriben antes de su implementación y deben fallar por la ausencia del comportamiento esperado.

---

## Phase 1: Setup del microservicio

**Purpose**: registrar el nuevo workspace y crear una base ejecutable consistente con Auth/Users.

- [X] T001 Crear el workspace `@stayhub/search-service` con scripts de build, start, lint, typecheck, suites Jest, cobertura, Prisma y rendimiento, y fijar NestJS 10.4.22, TypeScript 5.7.3, Prisma 6.19.0, Swagger 8.1.1, ioredis 5.4.2, JOSE 5.9.6, Jest 29.7 y Supertest 7 en `apps/search-service/package.json`
- [X] T002 Registrar `apps/search-service` en workspaces y agregar scripts raíz `build:search`, `lint:search`, `typecheck:search`, `test:search:*`, `prisma:search:*` sin alterar el comportamiento de Auth/Users en `package.json` y `package-lock.json`
- [X] T003 [P] Crear configuración TypeScript estricta y alias `@search/*` siguiendo las convenciones del monorepo en `apps/search-service/tsconfig.json` y `apps/search-service/tsconfig.build.json`
- [X] T004 [P] Configurar proyectos Jest `unit`, `integration`, `contract`, `security` y `performance`, cobertura global mínima de 70 % y setup aislado por suite en `apps/search-service/jest.config.ts` y `apps/search-service/test/{unit,integration,contract,security,performance}/setup.ts`
- [X] T005 Registrar `search-service` como aplicación NestJS con `root`, `sourceRoot`, `entryFile` y `tsConfigPath` propios en `nest-cli.json`
- [X] T006 [P] Crear el Dockerfile multi-stage no root para build, migración y runtime de Search en `infra/docker/search/Dockerfile`
- [X] T007 [P] Añadir las variables documentadas de Search con valores de ejemplo no secretos para puerto, DB, Redis, RabbitMQ, service JWT, caché, límites y telemetría en `.env.example`

**Checkpoint**: el workspace vacío puede instalar dependencias y ser reconocido por npm, Nest, TypeScript y Jest.

---

## Phase 2: Fundamentos bloqueantes

**Purpose**: establecer configuración, persistencia, seguridad, HTTP, observabilidad y entorno local compartidos por las tres historias.

**⚠️ CRITICAL**: ninguna historia debe integrarse antes de completar esta fase.

- [X] T008 Implementar carga y validación fail-fast de puerto, `SEARCH_DATABASE_URL_FILE`, Redis, RabbitMQ, issuer/audience/kid/scope RS256, TTL, límites, timeouts, prefetch, OTLP y shutdown en `apps/search-service/src/infrastructure/config/search-config.ts` y `apps/search-service/src/infrastructure/config/config.module.ts`
- [X] T009 [P] Definir los tipos de dominio compartidos de proyección con estas reglas literales: `accommodationId`: “PK externa estable, sin FK”; `projectionVersion`: “Positivo; solo una versión mayor puede reemplazar la actual”; `published`: “Solo true es consultable”; `name`: “Trim, no vacío. Peso FTS A”; `description`: “Resumen indexable, no ficha autoritativa. Peso FTS C”; `countryCode`: “ISO 3166-1 alpha-2 normalizado”; `region`: “Nullable; peso FTS A”; `city`: “Requerido; peso FTS A y sugerencias”; `addressSummary`: “Nullable; no debe exponer datos privados”; `location`: “Nullable durante fixtures; índice GiST. No habilita por sí sola filtros públicos por radio”; `minNightlyPrice`: “Mayor o igual a cero”; `currency`: “ISO 4217; filtros de precio comparan una sola moneda”; `capacity`: “Mayor que cero”; `amenities`: “Valores normalizados, sin duplicados; todas las solicitadas deben estar presentes”; `keywords`: “Términos contractuales adicionales; peso FTS B”; `primaryPhotoUrl`: “Nullable; solo miniatura/resumen, no galería”; `searchVector`: “Derivado con pesos: nombre/ubicación A, keywords/amenities B, descripción C”; `sourceUpdatedAt`: “Timestamp informado por el productor”; `indexedAt`: “Timestamp de aplicación local” en `apps/search-service/src/domain/projection.ts`
- [X] T010 [P] Definir `AvailabilityWindow` con `id`: “PK local”, `accommodationId`: “FK local a SearchDocument, cascade delete”, `startDate`: “Inclusiva”, `endDate`: “Exclusiva; mayor que startDate”, `availableCapacity`: “Mayor que cero” y `projectionVersion`: “Coincide con la versión que produjo la ventana” en `apps/search-service/src/domain/availability-window.ts`
- [X] T011 [P] Definir `ProcessedProjectionEvent` con `eventId`: “PK”, `eventType`: “Tipo contractual conocido”, `accommodationId`: “Entidad afectada”, `projectionVersion`: “Versión recibida”, `payloadHash`: “SHA-256 para detectar reutilización conflictiva de eventId”, `outcome`: “APPLIED, IGNORED_STALE, REMOVED” y `processedAt`: “Hora local de commit”; y `SearchIndexState` con `id`: “Siempre 1”, `cacheGeneration`: “Incrementa después de una mutación visible” y `updatedAt`: “Último cambio” en `apps/search-service/src/domain/projection-event.ts` y `apps/search-service/src/domain/search-index-state.ts`
- [X] T012 [P] Definir puertos tipados para índice, caché y unidad transaccional de proyección, sin dependencias NestJS/Prisma/RabbitMQ en `apps/search-service/src/application/ports/search-index.port.ts`, `apps/search-service/src/application/ports/search-cache.port.ts` y `apps/search-service/src/application/ports/projection-unit-of-work.port.ts`
- [X] T013 [P] Definir errores de aplicación para validación, autenticación, autorización, dependencia no disponible, replay conflictivo y evento inválido en `apps/search-service/src/application/errors/search-errors.ts`
- [X] T014 Modelar `SearchDocument`, `AvailabilityWindow`, `ProcessedProjectionEvent`, estado de índice y cursor/tombstone de versión por alojamiento para preservar monotonicidad tras `removed`, con tipos `Unsupported` donde Prisma no modele `geography`/`tsvector`, en `apps/search-service/prisma/schema.prisma`
- [X] T015 Crear migración SQL versionada que habilite `postgis` y `pg_trgm`, materialice columnas/constraints, inicialice `SearchIndexState(id=1)`, genere `searchVector` ponderado A/B/C y cree índices B-tree, GIN, `gin_trgm_ops` y GiST descritos en el modelo en `apps/search-service/prisma/migrations/001_search_projection/migration.sql` y `apps/search-service/prisma/migrations/migration_lock.toml`
- [X] T016 Implementar cliente Prisma con lectura de URL desde archivo secreto, lifecycle y módulo de persistencia en `apps/search-service/src/infrastructure/persistence/prisma/prisma.service.ts` y `apps/search-service/src/infrastructure/persistence/prisma/prisma.module.ts`
- [X] T017 [P] Implementar filtro Problem Details `application/problem+json`, códigos seguros y `traceId`, interceptor de correlación y `ValidationPipe` con transform, whitelist y rechazo de campos desconocidos en `apps/search-service/src/interfaces/http/problem.filter.ts`, `apps/search-service/src/interfaces/http/trace.interceptor.ts` y `apps/search-service/src/interfaces/http/validation.pipe.ts`
- [X] T018 [P] Implementar verificación service JWT restringida a RS256 con firma, `kid`, issuer, audience, expiración, skew y scope, más guard HTTP, en `apps/search-service/src/infrastructure/security/service-jwt.verifier.ts` y `apps/search-service/src/interfaces/http/guards/service-auth.guard.ts`
- [ ] T019 [P] Implementar logger estructurado, redacción de JWT/URLs/términos sensibles y bootstrap OpenTelemetry para trazas y métricas de HTTP, PostgreSQL, Redis y consumidor en `apps/search-service/src/infrastructure/observability/search-logger.ts` y `apps/search-service/src/infrastructure/observability/otel.ts`
- [ ] T020 Implementar `/health/live` y `/health/ready` donde readiness exige configuración, migraciones y PostgreSQL, pero reporta Redis/RabbitMQ degradados sin bloquear lecturas, en `apps/search-service/src/modules/health/health.controller.ts` y `apps/search-service/src/modules/health/health.module.ts`
- [ ] T021 Componer bootstrap, cierre ordenado, configuración HTTP global y módulos base sin lógica de negocio en `apps/search-service/src/main.ts` y `apps/search-service/src/app.module.ts`
- [X] T022 Añadir `search-db` PostgreSQL 16/PostGIS, `search-migrate`, `search-redis`, RabbitMQ con vhost/usuario de mínimo privilegio y `search-service:3004`, redes internas, secrets, healthchecks, dependencias y restart explícito en `docker-compose.yml`
- [X] T023 [P] Crear helpers para PostgreSQL/PostGIS, Redis, RabbitMQ, service JWT y limpieza segura de datos de prueba en `apps/search-service/test/helpers/search-app.ts`, `apps/search-service/test/helpers/dependencies.ts` y `apps/search-service/test/helpers/service-jwt.fixture.ts`
- [X] T024 [P] Crear dataset y publicador contractual reproducible con propiedades publicadas/no publicadas, monedas, filtros, ventanas y eventos válidos/inválidos en `apps/search-service/test/fixtures/search-documents.fixture.ts`, `apps/search-service/test/fixtures/projection-events.fixture.ts` y `apps/search-service/test/helpers/projection-publisher.ts`

**Checkpoint**: migraciones y dependencias compartidas están listas; las historias pueden implementarse contra los puertos.

---

## Phase 3: User Story 1 - Buscar alojamientos con filtros combinados (P1) 🎯 MVP

**Goal**: resolver RQ-04 sobre documentos publicados mediante filtros combinados, fechas proyectadas, relevancia y paginación estable; aportar solo el resumen parcial de RQ-06.

**Independent Test**: cargar el dataset contractual en `search_db`, llamar `GET /internal/v1/search` con combinaciones de ubicación, precio/moneda, fechas, huéspedes, amenidades y texto, y comprobar que todos los resultados publicados satisfacen semántica AND y orden estable.

### Tests for User Story 1

- [X] T025 [P] [US1] Escribir pruebas unitarias fallidas de normalización y reglas de `SearchQuery`: `q` 1–200, `location` 1–120, precio no negativo con `currency` requerida, `minPrice <= maxPrice`, fechas ambas o ninguna con `checkOut > checkIn`, `guests >= 1`, amenidades acotadas/sin duplicados, `page >= 1` y `pageSize` 1–100/default 20 en `apps/search-service/test/unit/search-query.spec.ts`
- [X] T026 [P] [US1] Escribir pruebas unitarias fallidas de orden determinista, desempate por `accommodationId`, resumen sin ficha completa y `availabilityKind: PROJECTED` solo con fechas en `apps/search-service/test/unit/search-result.spec.ts`
- [X] T027 [P] [US1] Escribir pruebas de integración fallidas para publicación, filtros AND, moneda, ventanas `[checkIn, checkOut)`, capacidad, amenities, FTS ponderado, paginación y consultas SQL parametrizadas sobre PostgreSQL/PostGIS real en `apps/search-service/test/integration/postgresql-search-index.spec.ts`
- [X] T028 [P] [US1] Escribir pruebas de contrato fallidas para `GET /internal/v1/search`, respuestas `200/400/401/403/503`, paginación, resumen de RQ-06 y Problem Details contra `contracts/openapi-search-service.yaml` en `apps/search-service/test/contract/search.contract.spec.ts`
- [X] T029 [P] [US1] Escribir pruebas de seguridad fallidas para JWT ausente/inválido, algoritmo distinto de RS256, `kid`/issuer/audience/exp/scope inválidos, campos desconocidos, cardinalidad e intentos de inyección tratados como valores en `apps/search-service/test/security/search-security.spec.ts`
- [X] T030 [P] [US1] Escribir pruebas de integración fallidas para cache miss/fill/hit, TTL, JSON corrupto, Redis caído con fallback PostgreSQL, no cachear errores y cambio de generación tras una mutación en `apps/search-service/test/integration/redis-search-cache.spec.ts`

### Implementation for User Story 1

- [X] T031 [P] [US1] Implementar `SearchQuery` normalizada con semántica AND y las restricciones comprobadas por T025 en `apps/search-service/src/domain/search-query.ts`
- [X] T032 [P] [US1] Implementar `SearchResult` con `accommodationId`, nombre, resumen de ubicación, precio/moneda, capacidad, amenidades, miniatura opcional, relevancia, metadatos y marca `PROJECTED` en `apps/search-service/src/domain/search-result.ts`
- [X] T033 [US1] Implementar búsqueda PostgreSQL parametrizada que filtre solo `published=true`, una moneda por rango, capacidad y todas las amenidades, cubra ventanas completas, aplique FTS A/B/C y desempate estable, y nunca use `$queryRawUnsafe` con entrada del usuario en `apps/search-service/src/infrastructure/search/postgresql-search-index.adapter.ts`
- [X] T034 [P] [US1] Implementar claves `search:v1:{cacheGeneration}:{hashFiltros}`, hash canónico, TTL+jitter, serialización segura y fallback fail-open sin `KEYS` en `apps/search-service/src/infrastructure/cache/redis-search-cache.adapter.ts`
- [X] T035 [US1] Implementar `SearchAccommodations` con lectura best-effort de caché, consulta autoritativa a PostgreSQL, mapeo del resumen, cache fill solo de `200` válido y métricas hit/miss en `apps/search-service/src/application/search/search-accommodations.use-case.ts`
- [X] T036 [P] [US1] Implementar DTO de query con restricciones OpenAPI, validaciones cruzadas de precio/moneda y fechas, transformación de amenidades repetidas y límites de cardinalidad en `apps/search-service/src/interfaces/http/dto/search-query.dto.ts`
- [X] T037 [US1] Implementar controlador protegido `GET /internal/v1/search`, traducción DTO→caso de uso y errores Problem Details sin lógica de ranking en `apps/search-service/src/interfaces/http/search.controller.ts`
- [X] T038 [US1] Componer puertos, adaptadores, caso de uso y controller de búsqueda en `apps/search-service/src/modules/search/search.module.ts`
- [ ] T039 [US1] Generar documentación Swagger de búsqueda sincronizada con `specs/002-alojamientos-busqueda/search_service/contracts/openapi-search-service.yaml`, incluyendo auth interna, límites y disponibilidad proyectada, en `apps/search-service/src/interfaces/openapi/search.openapi.ts` y `apps/search-service/src/interfaces/openapi/openapi.factory.ts`
- [X] T040 [US1] Ejecutar y estabilizar las pruebas T025–T030, demostrando que solo se retorna proyección publicada, que el resumen no declara RQ-06 completo y que Redis no altera exactitud, en `apps/search-service/test/{unit,integration,contract,security}/`

**Checkpoint**: US1 es un MVP independiente de búsqueda combinada contra proyección local.

---

## Phase 4: User Story 2 - Obtener sugerencias (P2)

**Goal**: sugerir nombres y ubicaciones indexadas, deduplicadas y ordenadas por similitud, sin personalización.

**Independent Test**: cargar nombres/ciudades conocidos y comprobar que un término exacto o con error menor devuelve como máximo 20 sugerencias `PROPERTY`/`LOCATION`, sin historial ni información personal.

### Tests for User Story 2

- [ ] T041 [P] [US2] Escribir pruebas unitarias fallidas para normalización de término, límite 1–20, deduplicación por texto/tipo, umbral configurable y orden determinista de sugerencias en `apps/search-service/test/unit/search-suggestion.spec.ts`
- [ ] T042 [P] [US2] Escribir pruebas de integración fallidas de `pg_trgm` sobre `name` y `city`, exclusión de no publicados, umbral, deduplicación y ausencia de campos personales en `apps/search-service/test/integration/postgresql-suggestions.spec.ts`
- [ ] T043 [P] [US2] Escribir pruebas de contrato y seguridad fallidas para `GET /internal/v1/search/suggest`, `q` 1–120, `limit` 1–20, service JWT y errores `400/401/403/503` contra OpenAPI en `apps/search-service/test/contract/suggest.contract.spec.ts` y `apps/search-service/test/security/suggest-security.spec.ts`

### Implementation for User Story 2

- [ ] T044 [P] [US2] Implementar `SearchSuggestion` con texto, tipo `PROPERTY|LOCATION` y score interno no expuesto en `apps/search-service/src/domain/suggestion.ts`
- [ ] T045 [US2] Extender el adaptador PostgreSQL con consulta parametrizada `pg_trgm` limitada a `name`/`city` de documentos publicados, umbral configurable y orden estable en `apps/search-service/src/infrastructure/search/postgresql-search-index.adapter.ts`
- [ ] T046 [US2] Implementar `SuggestSearchTerms` con normalización, deduplicación, límite y caché best-effort sin personalización en `apps/search-service/src/application/suggestions/suggest-search-terms.use-case.ts`
- [ ] T047 [P] [US2] Implementar DTO `q` 1–120 y `limit` 1–20/default 10, más schema de respuesta `{text,type}`, en `apps/search-service/src/interfaces/http/dto/suggest-query.dto.ts` y `apps/search-service/src/interfaces/http/dto/suggestion.response.ts`
- [ ] T048 [US2] Implementar `GET /internal/v1/search/suggest` protegido y su traducción de errores en `apps/search-service/src/interfaces/http/suggest.controller.ts`
- [ ] T049 [US2] Componer sugerencias y documentar Swagger sin recomendaciones, historial ni personalización en `apps/search-service/src/modules/suggestions/suggestions.module.ts` y `apps/search-service/src/interfaces/openapi/suggest.openapi.ts`
- [ ] T050 [US2] Ejecutar y estabilizar T041–T043, validando similitud para errores menores y que la respuesta solo contiene nombres/ubicaciones indexadas en `apps/search-service/test/{unit,integration,contract,security}/`

**Checkpoint**: US1 y US2 funcionan de forma independiente sobre el mismo read model.

---

## Phase 5: User Story 3 - Mantener una proyección indexada idempotente (P2)

**Goal**: aplicar `upserted` y `removed` de forma atómica, idempotente y monotónica mediante RabbitMQ, con fixtures mientras no exista productor real.

**Independent Test**: publicar eventos contractuales duplicados, fuera de orden, conflictivos, inválidos y de retiro; verificar convergencia, ack después de commit, retry limitado y DLQ.

### Tests for User Story 3

- [ ] T051 [P] [US3] Escribir pruebas JSON Schema fallidas para ambas variantes, campos requeridos, `schemaVersion=1`, UUID/fechas, `name` 1–160, `description` máximo 5000, país `[A-Z]{2}`, región/ciudad máximo 120, dirección máximo 240, latitud -90..90, longitud -180..180, precio >=0, moneda `[A-Z]{3}`, capacidad >=1, amenities/keywords únicos máximo 100 de 1–60, URL válida y disponibilidad máximo 366 en `apps/search-service/test/contract/projection-events.contract.spec.ts`
- [ ] T052 [P] [US3] Escribir pruebas unitarias fallidas para hash SHA-256, replay idempotente, conflicto por mismo `eventId` con payload distinto, versión stale, upsert/remove y generación de caché solo ante mutación visible en `apps/search-service/test/unit/projection-use-cases.spec.ts`
- [ ] T053 [P] [US3] Escribir pruebas de integración fallidas para transacción evento+documento+ventanas+cursor, concurrencia, rollback, reemplazo completo de ventanas y tombstone que impide resurrección por versión antigua en `apps/search-service/test/integration/projection-unit-of-work.spec.ts`
- [ ] T054 [P] [US3] Escribir pruebas RabbitMQ fallidas para cola durable, mensajes persistentes, prefetch, ack posterior al commit, redelivery, reintentos acotados, duplicate/out-of-order, poison message y DLQ sin payload sensible en logs en `apps/search-service/test/integration/rabbitmq-projection-consumer.spec.ts`

### Implementation for User Story 3

- [ ] T055 [P] [US3] Implementar DTO discriminado y validación exacta de `accommodation.search.v1.upserted|removed` conforme a `contracts/search-projection-events-v1.schema.json`, sin aceptar campos adicionales, en `apps/search-service/src/interfaces/events/projection-event.dto.ts`
- [ ] T056 [P] [US3] Implementar comandos internos normalizados de upsert/remove y cálculo canónico SHA-256 del payload en `apps/search-service/src/application/projections/projection.commands.ts` y `apps/search-service/src/application/projections/projection-payload-hash.ts`
- [ ] T057 [US3] Implementar unidad de trabajo Prisma que registre evento y outcome, compare cursor/version, reemplace documento+ventanas atómicamente, conserve tombstone tras retiro e incremente `cacheGeneration` solo en cambio visible en `apps/search-service/src/infrastructure/persistence/prisma/projection-unit-of-work.adapter.ts`
- [ ] T058 [US3] Implementar `UpsertProjection` con rechazo de replay conflictivo, éxito idempotente y descarte observable de versiones menores o iguales en `apps/search-service/src/application/projections/upsert-projection.use-case.ts`
- [ ] T059 [US3] Implementar `RemoveProjection` para retirar el documento consultable preservando la versión monotónica aun si el alojamiento no existía localmente en `apps/search-service/src/application/projections/remove-projection.use-case.ts`
- [ ] T060 [US3] Implementar consumidor RabbitMQ con exchange/routing/queue/DLX/DLQ v1, validación antes de aplicación, ack manual después del commit, prefetch y retry limitado en `apps/search-service/src/infrastructure/messaging/rabbitmq-projection.consumer.ts`
- [ ] T061 [US3] Componer consumidor, casos de uso y adaptadores sin crear endpoint HTTP de indexación en `apps/search-service/src/modules/projections/projections.module.ts`
- [ ] T062 [US3] Ejecutar y estabilizar T051–T054 usando únicamente fixtures/publicador de prueba y documentar que el productor/outbox de Accommodations sigue diferido en `apps/search-service/test/{unit,integration,contract}/`

**Checkpoint**: el índice converge ante duplicados, desorden y retiros sin depender de `accommodations-service`.

---

## Phase 6: Polish y requisitos transversales

**Purpose**: cerrar rendimiento, contratos, operación, calidad y evidencia sin ampliar el alcance funcional.

- [ ] T063 [P] Implementar prueba de drift entre Swagger generado y `contracts/openapi-search-service.yaml`, y entre DTOs/fixtures y el JSON Schema de eventos, en `apps/search-service/test/contract/openapi-drift.spec.ts` y `apps/search-service/test/contract/event-schema-drift.spec.ts`
- [ ] T064 [P] Añadir pruebas de estructura que prohíban imports de infraestructura hacia dominio/aplicación, imports cruzados desde Auth/Users/Gateway y acceso a bases ajenas en `apps/search-service/test/unit/search-layer-structure.spec.ts`
- [ ] T065 [P] Crear perfil de rendimiento versionado con seed representativo, mezcla de filtros, caché fría/caliente, calentamiento, concurrencia, recursos y gate p95 < 500 ms con errores inesperados < 1 % en `apps/search-service/test/performance/search-performance.spec.ts` y `apps/search-service/test/fixtures/performance-dataset.ts`
- [ ] T066 Instrumentar histogramas HTTP, resultados, cache ratio, query timeout, event lag, duplicate/stale/DLQ y trazas HTTP→caso de uso→dependencia/consumer→transacción en `apps/search-service/src/infrastructure/observability/search-metrics.ts` y `apps/search-service/src/infrastructure/observability/otel.ts`
- [ ] T067 [P] Documentar ejecución, variables, migraciones, contratos, seguridad, degradación Redis/RabbitMQ, alcance RQ-04 y contribución parcial RQ-06 en `apps/search-service/README.md`
- [ ] T068 Verificar Docker Compose con migración antes del servicio, healthchecks, secretos no versionados, contenedor no root y filesystem de solo lectura cuando sea viable; registrar ajustes solo en `docker-compose.yml` e `infra/docker/search/Dockerfile`
- [ ] T069 Ejecutar `lint:search`, `typecheck:search`, build, unidad, integración, contrato, seguridad, rendimiento y cobertura >=70 %, y corregir únicamente defectos de Search en `apps/search-service/` y los scripts Search de `package.json`
- [ ] T070 Ejecutar todos los escenarios de `quickstart.md` y registrar evidencia reproducible sin afirmar integración Gateway↔Search, Accommodations↔Search ni disponibilidad autoritativa en `specs/002-alojamientos-busqueda/search_service/quickstart.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (T001–T007)**: inicia inmediatamente. T002 depende de T001; T005 depende de T003.
- **Phase 2 (T008–T024)**: depende del workspace. T015 depende de T014; T016 depende de T014; T020–T022 dependen de la configuración fijada en T008.
- **US1 (T025–T040)**: depende de Phase 2. T025–T030 se escriben primero; T033 depende de T031–T032 y T015–T016; T035 depende de T033–T034; T037–T039 dependen del caso de uso/DTO.
- **US2 (T041–T050)**: depende del índice y la base de US1 para consultas `pg_trgm`; puede iniciar sus pruebas/dominio en paralelo con la implementación tardía de US1, pero T045 requiere T033.
- **US3 (T051–T062)**: depende de Phase 2, no de los endpoints de US1/US2. T057 depende de T014–T016 y T055–T056; el consumidor T060 depende de T057–T059.
- **Phase 6 (T063–T070)**: contratos/estructura pueden avanzar al cerrar cada historia; rendimiento y validación final dependen de US1–US3.

### User story dependency graph

```text
Setup → Foundational ─┬─→ US1 (P1, MVP) ─→ US2 (P2)
                      └─→ US3 (P2)

US1 + US2 + US3 → Polish/quality gates
```

- **US1** es el MVP funcional y no necesita US2 ni US3 si el dataset se carga directamente mediante fixtures de prueba.
- **US2** reutiliza el adaptador/índice creado por US1, pero conserva pruebas y endpoint independientes.
- **US3** puede desarrollarse en paralelo con US1 después de los fundamentos; conecta los eventos al mismo modelo sin depender de sus controladores.
- No existe dependencia de implementación con frontend, Gateway, Bookings o Accommodations dentro de estas tareas.

### Parallel opportunities

- T003, T004, T006 y T007 pueden ejecutarse en paralelo tras crear el workspace.
- T009–T013 y T017–T019 afectan capas/archivos distintos y pueden avanzar en paralelo.
- Los tests T025–T030, T041–T043 y T051–T054 pueden repartirse por suites antes de implementar cada historia.
- Tras Phase 2, una persona puede trabajar US1/US2 y otra US3; deben coordinar cambios en `postgresql-search-index.adapter.ts`, `app.module.ts` y `docker-compose.yml`.
- T063–T067 son paralelizables una vez estabilizados los contratos y comportamientos que verifican.

---

## Parallel Examples

### US1

```text
T025 SearchQuery unit tests
T027 PostgreSQL integration tests
T028 HTTP contract tests
T029 Security tests
T030 Redis integration tests
```

### US2

```text
T041 Suggestion unit tests
T042 pg_trgm integration tests
T043 Suggest contract/security tests
```

### US3

```text
T051 Event JSON Schema tests
T052 Projection use-case tests
T053 Projection transaction tests
T054 RabbitMQ delivery tests
```

---

## Implementation Strategy

### MVP first

1. Completar T001–T024.
2. Escribir T025–T030 y confirmar que fallan por comportamiento ausente.
3. Implementar T031–T039 y estabilizar con T040.
4. Validar US1 de forma aislada: RQ-04 sobre fixtures y resumen parcial de RQ-06.
5. No declarar integración productiva con catálogo real.

### Incremental delivery

1. **Fundación**: workspace, DB/migración, seguridad, Docker y observabilidad base.
2. **MVP US1**: búsqueda combinada y paginada.
3. **US2**: sugerencias aproximadas no personalizadas.
4. **US3**: mantenimiento idempotente del read model mediante eventos.
5. **Cierre**: drift, seguridad, rendimiento, cobertura, Compose y quickstart.

### Definition of Done

- Todas las tareas seleccionadas están completas y sus pruebas pasan.
- RQ-04 tiene evidencia aislada; RQ-06 sigue declarada parcial; RQ-03/RQ-05 permanecen fuera.
- OpenAPI y JSON Schema no presentan drift.
- PostgreSQL es autoritativo, Redis falla abierto y RabbitMQ no bloquea consultas existentes.
- Cobertura del código afectado >=70 % y p95 <500 ms bajo perfil reproducible.
- No se añadieron endpoints geográficos, personalización, Elasticsearch/pgvector ni tareas de otros servicios.
