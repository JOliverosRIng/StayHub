# Tasks: bookings-service — Sprint 3

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` y `quickstart.md` de esta feature.
**Trazabilidad**: RQ-07–RQ-10; RQ-11 solo como elegibilidad de estadía completada.
**Tests**: obligatorios por la constitución y BKG-NFR-007; se escriben primero y deben fallar por la conducta ausente.
**Límite**: no implementar frontend, Payments, Reviews, Notifications ni Accommodations dentro de estas tareas.

## Formato

- `[P]`: ejecutable en paralelo porque usa archivos distintos y no depende de una tarea incompleta.
- `[USn]`: historia de `spec.md`.
- Una dependencia externa permite implementar contra puertos/stubs, pero impide afirmar integración real.

## Phase 1: Setup

**Propósito**: registrar el microservicio y preparar una base compilable sin lógica funcional.

- [x] T001 Crear `apps/bookings-service/package.json`, `apps/bookings-service/tsconfig.json` y `apps/bookings-service/tsconfig.build.json` con Node `>=20 <21`, NestJS 10.4, TypeScript 5.7, Prisma 6.19, Jest 29 y scripts build/lint/typecheck/test/migrate
- [x] T002 Registrar `apps/bookings-service` y scripts `build|lint|typecheck|test|prisma:bookings:*` en `package.json`, `package-lock.json`, `nest-cli.json` y `tsconfig.base.json` sin alterar contratos de otros workspaces
- [x] T003 [P] Configurar ESLint y fronteras de capas en `apps/bookings-service/eslint.config.mjs` prohibiendo imports Nest/Prisma/HTTP desde `src/domain/`
- [x] T004 [P] Configurar proyectos Jest `unit|integration|contract|security|concurrency|performance|e2e` y umbral global 70 % en `apps/bookings-service/jest.config.ts`
- [x] T005 [P] Crear `.env.example` sin secretos con todas las variables de plan en `apps/bookings-service/.env.example`
- [x] T006 [P] Crear imagen multi-stage Node 20 no-root, target migration y healthcheck en `infra/docker/bookings/Dockerfile` y `infra/docker/bookings/Dockerfile.dockerignore`
- [x] T007 [P] Crear bootstrap mínimo y composición vacía en `apps/bookings-service/src/main.ts` y `apps/bookings-service/src/app.module.ts`
- [x] T008 [P] Crear README operativo con alcance, puerto 3005, comandos y límites de evidencia en `apps/bookings-service/README.md`
- [x] T009 Regenerar lockfile raíz e instalar/generar Prisma verificando que Auth, Users, Search y Accommodations no cambian de comportamiento mediante `package-lock.json`

**Checkpoint**: workspace reconocido, dependencias reproducibles y proyecto vacío compilable.

---

## Phase 2: Foundational — bloquea todas las historias

**Propósito**: dominio compartido, persistencia, seguridad, contratos y operación requeridos por todas las historias.

- [x] T010 [P] Escribir pruebas fallidas de configuración obligatoria, secretos `_FILE`, puerto 3005, URLs, JWT, RabbitMQ, hold y policy version en `apps/bookings-service/test/unit/bookings-config.spec.ts`
- [x] T011 Implementar configuración fail-fast tipada sin defaults productivos para hold/política en `apps/bookings-service/src/infrastructure/config/bookings-config.ts` y `apps/bookings-service/src/infrastructure/config/config.module.ts` (depends on T010)
- [x] T012 [P] Escribir pruebas fallidas de `StayPeriod` `[checkIn,checkOut)`, `checkOut > checkIn`, noches positivas y fecha no pasada en `apps/bookings-service/test/unit/stay-period.spec.ts`
- [x] T013 [P] Escribir pruebas fallidas de `Money` decimal exacto, amount positivo `numeric(12,2)` y currency `^[A-Z]{3}$` en `apps/bookings-service/test/unit/money.spec.ts`
- [x] T014 [P] Implementar value objects y errores puros en `apps/bookings-service/src/domain/shared/domain-error.ts`, `apps/bookings-service/src/domain/bookings/stay-period.ts` y `apps/bookings-service/src/domain/money/money.ts` (depends on T012–T013)
- [x] T015 [P] Escribir pruebas fallidas de la máquina `PENDING_PAYMENT|CONFIRMED|CHECKED_IN|COMPLETED|PAYMENT_FAILED|EXPIRED|CANCELLED_BY_GUEST|CANCELLED_BY_OWNER` en `apps/bookings-service/test/unit/booking-state.spec.ts`
- [x] T016 Implementar agregado y transiciones listadas en `data-model.md` en `apps/bookings-service/src/domain/bookings/booking.ts` y `apps/bookings-service/src/domain/bookings/booking-status.ts` (depends on T014–T015)
- [x] T017 [P] Escribir pruebas de esquema/migración para CHECKs, índices, `btree_gist`, daterange `[)` y exclusión de estados bloqueantes en `apps/bookings-service/test/integration/migrations-health.spec.ts`
- [x] T018 Modelar `Booking`, `BookingTransition`, `IdempotencyRecord`, `PaymentWork`, `OutboxEvent`, `ProcessedEvent` y `CancellationDecision` con campos/nullable exactos de `data-model.md` en `apps/bookings-service/prisma/schema.prisma` (depends on T016–T017)
- [x] T019 Crear migración inicial PostgreSQL con GiST `roomId WITH =` + `stayPeriod WITH &&` solo para `PENDING_PAYMENT|CONFIRMED|CHECKED_IN` en `apps/bookings-service/prisma/migrations/001_bookings_core/migration.sql` (depends on T018)
- [x] T020 [P] Definir puertos de reloj, IDs, UoW, repositorio, quote, Payments, policy, Outbox e Inbox en `apps/bookings-service/src/application/ports/` sin imports de infraestructura
- [x] T021 Implementar Prisma lifecycle/readiness y tokens DI en `apps/bookings-service/src/infrastructure/persistence/prisma/prisma.service.ts` y `apps/bookings-service/src/infrastructure/persistence/prisma/prisma.module.ts` (depends on T018–T020)
- [x] T022 [P] Escribir pruebas adversariales RS256 para alg/kid/iss/aud/iat/exp/scope y spoofing de identidad en `apps/bookings-service/test/security/service-auth.spec.ts`
- [x] T023 Implementar verificador service JWT, guard y contexto de identidad confiable en `apps/bookings-service/src/infrastructure/security/service-jwt.verifier.ts` y `apps/bookings-service/src/interfaces/http/guards/service-auth.guard.ts` (depends on T011,T022)
- [x] T024 [P] Escribir pruebas fallidas de DTO cerrado, Problem Details y precedencia 401/403/404 en `apps/bookings-service/test/unit/http-adapters.spec.ts`
- [x] T025 Implementar validation pipe, Problem mapper/filter y trace interceptor en `apps/bookings-service/src/interfaces/http/validation.pipe.ts`, `apps/bookings-service/src/interfaces/http/problem.filter.ts` y `apps/bookings-service/src/interfaces/http/trace.interceptor.ts` (depends on T024)
- [x] T026 [P] Implementar logger JSON seguro, métricas base y OpenTelemetry en `apps/bookings-service/src/infrastructure/observability/bookings-logger.ts`, `apps/bookings-service/src/infrastructure/observability/bookings-metrics.ts` y `apps/bookings-service/src/infrastructure/observability/otel.ts`
- [x] T027 [P] Escribir tests JSON Schema y OpenAPI sintácticos para todos los archivos de `specs/003-reservas-pagos-resenas/booking_service/contracts/` en `apps/bookings-service/test/contract/design-contracts.spec.ts`
- [x] T028 Implementar DTO parser común de eventos con UUID/date-time/schemaVersion=1 y rechazo de campos inválidos en `apps/bookings-service/src/interfaces/events/booking-payment-event.dto.ts` (depends on T027)
- [x] T029 [P] Implementar `/health/live` y `/health/ready` con DB/migraciones obligatorias en `apps/bookings-service/src/modules/health/health.controller.ts` y `apps/bookings-service/src/modules/health/health.module.ts`
- [x] T030 Integrar configuración, Prisma, seguridad, HTTP, observabilidad y health en `apps/bookings-service/src/app.module.ts` y `apps/bookings-service/src/main.ts` (depends on T011,T021,T023,T025–T029)

**Checkpoint**: foundation lista; las historias pueden dividirse entre personas, respetando dependencias indicadas.

---

## Phase 3: US1 — Crear reserva sin sobreventa (P1) 🎯 MVP

**Goal**: crear una reserva `PENDING_PAYMENT` idempotente, con snapshot autoritativo, intervalo protegido e inicio recuperable de pago.

**Independent Test**: contra PostgreSQL real y stubs contractuales, dos comandos superpuestos producen un `201` y un `409`; replay exacto devuelve la misma reserva y una sola orden.

### Tests first

- [x] T031 [P] [US1] Escribir pruebas fallidas de create command: UUID, `guests >= 1`, `[checkIn,checkOut)`, fecha no pasada, capacidad y total `nightlyPrice × nights` en `apps/bookings-service/test/unit/create-booking.use-case.spec.ts`
- [x] T032 [P] [US1] Escribir contrato HTTP fallido para `POST /bookings`, `Idempotency-Key` 16–128 `^[A-Za-z0-9._:-]+$`, 201/400/401/403/404/409/503 y DTO sin `guestId|ownerId|price` en `apps/bookings-service/test/contract/create-booking.contract.spec.ts`
- [x] T033 [P] [US1] Escribir consumer test del quote exacto `PUBLISHED`, owner UUID, capacity >=1, basePrice positivo y propertyVersion >=1 en `apps/bookings-service/test/contract/accommodations-quote.consumer.spec.ts`
- [x] T034 [P] [US1] Escribir integración fallida con PostgreSQL real para solapamiento concurrente, contiguos permitidos y estados liberados en `apps/bookings-service/test/concurrency/booking-overlap.spec.ts`
- [x] T035 [P] [US1] Escribir pruebas fallidas de idempotencia `(guestId,key)`, SHA-256 canónico, replay igual y hash distinto `IDEMPOTENCY_CONFLICT` en `apps/bookings-service/test/integration/create-idempotency.spec.ts`
- [x] T036 [P] [US1] Escribir pruebas fallidas de saga: PaymentWork único, timeout/retry, confirmación, fallo, evento duplicado y expiración de hold en `apps/bookings-service/test/integration/payment-saga.spec.ts`
- [x] T037 [P] [US1] Escribir pruebas de esquema para `booking.v1.created|confirmed` y `payment.v1.confirmed|failed` en `apps/bookings-service/test/contract/booking-payment-events.contract.spec.ts`

### Implementation

- [x] T038 [P] [US1] Implementar DTO cerrado y parser de creación sin campos de identidad/precio en `apps/bookings-service/src/interfaces/http/dto/create-booking.dto.ts` (depends on T031–T032)
- [x] T039 [P] [US1] Implementar `AccommodationQuotePort` types y mapper sin filtrar detalles remotos en `apps/bookings-service/src/application/ports/accommodation-quote.port.ts` y `apps/bookings-service/src/infrastructure/http/accommodations-quote.mapper.ts` (depends on T033)
- [x] T040 [US1] Implementar cliente REST de quote con service JWT, timeout y mapeo 400/401/403/404/409/503 en `apps/bookings-service/src/infrastructure/http/accommodations-booking-quote.client.ts` (depends on T023,T039)
- [x] T041 [P] [US1] Implementar repositorio Prisma de lectura/escritura y mapeo Decimal/date/status en `apps/bookings-service/src/infrastructure/persistence/prisma/booking.repository.ts` (depends on T018–T021)
- [x] T042 [P] [US1] Implementar repositorio idempotente con unicidad `(guestId,key)`, requestHash `char(64)` y estados `IN_PROGRESS|COMPLETED|FAILED_RETRYABLE` en `apps/bookings-service/src/infrastructure/persistence/prisma/idempotency.repository.ts` (depends on T035)
- [x] T043 [US1] Implementar UoW de creación que persiste Booking, transición, IdempotencyRecord, PaymentWork y Outbox atómicamente y traduce exclusion violation a `BOOKING_CONFLICT` en `apps/bookings-service/src/infrastructure/persistence/prisma/create-booking.unit-of-work.ts` (depends on T019,T041–T042)
- [x] T044 [US1] Implementar `CreateBookingUseCase` con quote, snapshot, cálculo decimal, hold obligatorio e idempotencia en `apps/bookings-service/src/application/create-booking/create-booking.use-case.ts` (depends on T016,T020,T038,T040,T043)
- [x] T045 [P] [US1] Implementar `PaymentOrdersPort`, tipos e idempotency key derivada de bookingId en `apps/bookings-service/src/application/ports/payment-orders.port.ts`
- [x] T046 [US1] Implementar cliente Payments para `POST /internal/v1/payment-orders` con timeout, retry solo seguro y Problem Details remoto en `apps/bookings-service/src/infrastructure/http/payments-orders.client.ts` (depends on T023,T045; external dependency: payments-service contract provider)
- [x] T047 [US1] Implementar repositorio/reclamador de PaymentWork con backoff, límite y múltiples réplicas en `apps/bookings-service/src/infrastructure/persistence/prisma/payment-work.repository.ts` (depends on T018,T021)
- [x] T048 [US1] Implementar worker recuperable para crear orden sin mantener transacción DB durante HTTP en `apps/bookings-service/src/application/payments/create-payment-order.worker.ts` (depends on T046–T047)
- [x] T049 [P] [US1] Implementar Outbox repository/publisher con confirm, mensajes persistentes y publishedAt posterior al broker ack en `apps/bookings-service/src/infrastructure/messaging/rabbitmq-outbox.publisher.ts` (depends on T020,T028)
- [x] T050 [US1] Implementar Inbox consumer de `payment.v1.confirmed|failed` con eventId/hash/ack tras commit y DLQ en `apps/bookings-service/src/infrastructure/messaging/rabbitmq-payment.consumer.ts` (depends on T028,T037,T041,T049)
- [x] T051 [US1] Implementar casos de uso de confirmación/fallo monotónicos y Outbox `booking.v1.confirmed` en `apps/bookings-service/src/application/payments/apply-payment-result.use-case.ts` (depends on T016,T050)
- [x] T052 [US1] Implementar expirador de `PENDING_PAYMENT` por lotes acotados y locking seguro en `apps/bookings-service/src/application/payments/expire-payment-holds.worker.ts` (depends on T041,T047)
- [x] T053 [US1] Implementar controller `POST /bookings`, presenter y módulo de reservas en `apps/bookings-service/src/interfaces/http/bookings/bookings.controller.ts`, `apps/bookings-service/src/interfaces/http/bookings/booking.presenter.ts` y `apps/bookings-service/src/modules/bookings/bookings.module.ts` (depends on T044,T048–T052)
- [x] T054 [US1] Generar Swagger de creación sincronizado con OpenAPI y ejecutar T031–T037 como evidencia MVP en `apps/bookings-service/src/interfaces/openapi/bookings.openapi.ts` y `apps/bookings-service/test/` (depends on T053)

**Checkpoint**: US1 funciona con PostgreSQL/RabbitMQ reales y colaboradores contractuales; integración real sigue explícitamente pendiente.

---

## Phase 4: US2 — Consultar reserva autorizada (P1)

**Goal**: consultar una reserva como huésped u owner relacionado sin revelar recursos ajenos.

**Independent Test**: una fixture persistida es visible para su GUEST y OWNER snapshot; otro actor recibe 404 y nunca owner/payment secrets.

- [ ] T055 [P] [US2] Escribir pruebas fallidas de autorización GUEST/OWNER, no-disclosure 404 y presenter seguro en `apps/bookings-service/test/security/booking-read-authorization.spec.ts`
- [ ] T056 [P] [US2] Escribir contrato fallido para `GET /bookings/{bookingId}` con UUID, 200/400/401/404 y schema Booking en `apps/bookings-service/test/contract/get-booking.contract.spec.ts`
- [ ] T057 [P] [US2] Escribir integración de lectura del snapshot aun si el quote remoto ya no existe en `apps/bookings-service/test/integration/get-booking.spec.ts`
- [ ] T058 [US2] Implementar `GetBookingUseCase` aplicando `guestId|ownerId` antes de mapear detalles en `apps/bookings-service/src/application/get-booking/get-booking.use-case.ts` (depends on T055,T057)
- [ ] T059 [US2] Implementar GET/presenter omitiendo ownerId donde no corresponda y todo dato financiero sensible en `apps/bookings-service/src/interfaces/http/bookings/bookings.controller.ts` y `apps/bookings-service/src/interfaces/http/bookings/booking.presenter.ts` (depends on T056,T058)
- [ ] T060 [US2] Sincronizar Swagger/drift y ejecutar pruebas US2 en `apps/bookings-service/src/interfaces/openapi/bookings.openapi.ts` y `apps/bookings-service/test/contract/openapi-drift.spec.ts` (depends on T059)

**Checkpoint**: detalle funcional e independiente sobre fixtures locales, sin dependencia runtime de Accommodations.

---

## Phase 5: US3 — Cancelar como huésped (P1)

**Goal**: cancelar una reserva propia elegible, liberar el intervalo y solicitar reembolso idempotente si aplica.

**Independent Test**: GUEST propio elegible cancela y permite una nueva reserva superpuesta; ajeno obtiene 404 y policy ineligible obtiene 409 sin mutación.

- [ ] T061 [P] [US3] Escribir pruebas fallidas de `CancellationPolicy` versionada, decisión eligible/ineligible y `refundMode NONE|POLICY` en `apps/bookings-service/test/unit/guest-cancellation-policy.spec.ts`
- [ ] T062 [P] [US3] Escribir contrato fallido de `DELETE /bookings/{id}` como GUEST con 200/400/401/404/409/503 en `apps/bookings-service/test/contract/cancel-booking.contract.spec.ts`
- [ ] T063 [P] [US3] Escribir integración de cancelación atómica, transición, CancellationDecision, liberación GiST y refund único en `apps/bookings-service/test/integration/guest-cancellation.spec.ts`
- [ ] T064 [P] [US3] Implementar puerto/config adapter de policy que exige versión aprobada y no codifica plazos/porcentajes en `apps/bookings-service/src/application/ports/cancellation-policy.port.ts` y `apps/bookings-service/src/infrastructure/config/versioned-cancellation-policy.adapter.ts` (depends on T061)
- [ ] T065 [US3] Implementar UoW de cancelación con lock/version, transición, decisión, PaymentWork y Outbox atómicos en `apps/bookings-service/src/infrastructure/persistence/prisma/cancel-booking.unit-of-work.ts` (depends on T019,T041,T063)
- [ ] T066 [US3] Implementar `CancelGuestBookingUseCase` con ownership, estados cancelables y errores estables en `apps/bookings-service/src/application/cancel-booking/cancel-guest-booking.use-case.ts` (depends on T064–T065)
- [ ] T067 [P] [US3] Extender Payments client para `POST /internal/v1/refunds` con key derivada, mode POLICY y retry seguro en `apps/bookings-service/src/infrastructure/http/payments-refunds.client.ts` (depends on T045; external dependency: payments-service contract provider)
- [ ] T068 [US3] Extender PaymentWork worker/consumer para refund pending/completed sin reactivar disponibilidad en `apps/bookings-service/src/application/payments/request-refund.worker.ts` y `apps/bookings-service/src/application/payments/apply-refund-result.use-case.ts` (depends on T050,T067)
- [ ] T069 [US3] Implementar DELETE para GUEST, Swagger y evidencia US3 en `apps/bookings-service/src/interfaces/http/bookings/bookings.controller.ts` y `apps/bookings-service/src/interfaces/openapi/bookings.openapi.ts` (depends on T062,T066,T068)

**Checkpoint**: RQ-09 técnicamente listo contra policy fixture/Payments stub; política productiva y Payments real bloquean el cierre externo.

---

## Phase 6: US4 — Historial y cancelación del propietario (P1)

**Goal**: OWNER consulta reservas recibidas y cancela una propia con justificación y reembolso completo.

**Independent Test**: dos owners con fixtures distintas solo ven/modifican las propias; filtros son deterministas y cancelación OWNER exige razón.

- [ ] T070 [P] [US4] Escribir pruebas fallidas de query `ownerId=principal.sub`, filtros fecha/estado/guestId, page >=1, pageSize 1–100 y orden `createdAt DESC,id DESC` en `apps/bookings-service/test/integration/owner-history.spec.ts`
- [ ] T071 [P] [US4] Escribir contratos fallidos de `GET /bookings/history` y DELETE OWNER con reason 1–500 en `apps/bookings-service/test/contract/owner-bookings.contract.spec.ts`
- [ ] T072 [P] [US4] Escribir seguridad multi-owner: aislamiento, 404 ajeno, razón ausente 400 y ADMIN sin capacidad nueva en `apps/bookings-service/test/security/owner-bookings-authorization.spec.ts`
- [ ] T073 [US4] Implementar query Prisma indexada y conteo/página determinista en `apps/bookings-service/src/infrastructure/persistence/prisma/owner-booking-history.query.ts` (depends on T019,T070)
- [ ] T074 [US4] Implementar `GetOwnerBookingHistoryUseCase` sin consultar Accommodations en `apps/bookings-service/src/application/owner-history/get-owner-booking-history.use-case.ts` (depends on T073)
- [ ] T075 [US4] Implementar `CancelOwnerBookingUseCase` con owner snapshot, reason obligatoria, policyVersion auditada y refundMode FULL en `apps/bookings-service/src/application/cancel-booking/cancel-owner-booking.use-case.ts` (depends on T065,T068,T072)
- [ ] T076 [US4] Implementar endpoint history y selección GUEST/OWNER del comando DELETE en `apps/bookings-service/src/interfaces/http/bookings/bookings.controller.ts` (depends on T071,T074–T075)
- [ ] T077 [US4] Sincronizar presenters/Swagger de historial/cancelación OWNER en `apps/bookings-service/src/interfaces/http/bookings/booking-page.presenter.ts` y `apps/bookings-service/src/interfaces/openapi/bookings.openapi.ts` (depends on T076)
- [ ] T078 [US4] Ejecutar suite RQ-08/RQ-10 con PostgreSQL real y registrar evidencia aislada en `specs/003-reservas-pagos-resenas/booking_service/quickstart.md` (depends on T070–T077)

**Checkpoint**: RQ-08 y RQ-10 funcionan contra snapshots locales y Payments contractual.

---

## Phase 7: US5 — Check-in/out y contrato para Reviews (P2)

**Goal**: completar estadía y ofrecer evidencia autoritativa mínima para que `review_service` avance en paralelo sin acceder a `bookings_db`.

**Independent Test**: solo OWNER relacionado transiciona CONFIRMED→CHECKED_IN→COMPLETED; endpoint/evento responde elegible únicamente al GUEST/property correctos.

- [ ] T079 [P] [US5] Escribir pruebas fallidas de estados/ownership/fechas para check-in y check-out básico en `apps/bookings-service/test/unit/stay-lifecycle.spec.ts`
- [ ] T080 [P] [US5] Escribir contrato fallido para POST check-in/check-out y GET review-eligibility con service scope separado en `apps/bookings-service/test/contract/stay-review-eligibility.contract.spec.ts`
- [ ] T081 [P] [US5] Crear fixture provider estable de `booking.v1.completed` y respuesta eligibility para entrega al equipo Reviews en `apps/bookings-service/test/fixtures/reviews-handoff.fixture.ts` y `apps/bookings-service/test/fixtures/REVIEWS-HANDOFF.md`
- [ ] T082 [P] [US5] Escribir integración de transiciones, evento Outbox y elegibilidad positiva/negativa en `apps/bookings-service/test/integration/stay-lifecycle.spec.ts`
- [ ] T083 [US5] Implementar `CheckInBookingUseCase` y `CheckOutBookingUseCase` con OWNER snapshot y máquina de estados en `apps/bookings-service/src/application/stay-lifecycle/check-in-booking.use-case.ts` y `apps/bookings-service/src/application/stay-lifecycle/check-out-booking.use-case.ts` (depends on T079,T082)
- [ ] T084 [US5] Implementar controllers POST check-in/check-out sin no-show ni reglas avanzadas en `apps/bookings-service/src/interfaces/http/bookings/stay-lifecycle.controller.ts` (depends on T080,T083)
- [ ] T085 [US5] Implementar `GetReviewEligibilityUseCase` que exige booking COMPLETED y coincidencia guestId en `apps/bookings-service/src/application/stay-lifecycle/get-review-eligibility.use-case.ts` (depends on T080,T082)
- [ ] T086 [US5] Implementar controller interno con audience/scope de Reviews y no-disclosure 404 en `apps/bookings-service/src/interfaces/http/internal/review-eligibility.controller.ts` (depends on T023,T085)
- [ ] T087 [US5] Publicar `booking.v1.completed` desde la misma UoW del check-out con payload mínimo bookingId/guestId/propertyId en `apps/bookings-service/src/infrastructure/persistence/prisma/stay-lifecycle.unit-of-work.ts` (depends on T049,T083)
- [ ] T088 [US5] Sincronizar Swagger/JSON Schema, ejecutar provider tests y congelar handoff consumible sin cambios internos por Reviews en `apps/bookings-service/test/contract/reviews-provider.contract.spec.ts` y `specs/003-reservas-pagos-resenas/booking_service/contracts/booking-payment-events-v1.schema.json` (depends on T081,T084,T086–T087)

**Checkpoint**: Reviews puede consumir contrato/fixtures en paralelo; integración real no requiere compartir tablas ni imports.

---

## Phase 8: Polish, integración y gates transversales

- [ ] T089 [P] Añadir `bookings-db`, `bookings-migrate`, `bookings-service`, secretos, redes, healthchecks y `restart: always` en `docker-compose.yml` y `.env.example`
- [ ] T090 [P] Añadir gates build/lint/typecheck/unit/integration/contract/security/concurrency/OpenAPI/imagen en `.github/workflows/ci.yml`
- [ ] T091 [P] Implementar validador OpenAPI/JSON Schema y drift generado↔fuente en `scripts/validate-bookings-contracts.mjs` y `apps/bookings-service/test/contract/openapi-drift.spec.ts`
- [ ] T092 [P] Ejecutar hardening de JWT, header spoofing, DTO cerrado, SQL injection, PII/log redaction y códigos seguros en `apps/bookings-service/test/security/bookings-security.spec.ts`
- [ ] T093 [P] Crear dataset reproducible y gate p95 <500 ms para detalle/historial, registrando entorno y errores <1 %, en `apps/bookings-service/test/performance/bookings-performance.spec.ts` y `apps/bookings-service/test/fixtures/performance-dataset.ts`
- [ ] T094 Crear E2E aislado create→payment.confirmed→check-in→check-out y cancelaciones/refunds con colaboradores contractuales en `apps/bookings-service/test/e2e/bookings-isolated.e2e-spec.ts` (depends on T054,T060,T069,T078,T088)
- [ ] T095 Ejecutar provider-consumer e integración real Bookings→Accommodations quote en `apps/bookings-service/test/contract/accommodations-provider.contract.spec.ts` y `apps/bookings-service/test/e2e/bookings-accommodations.e2e-spec.ts` (depends on T040,T054; external dependency: endpoint quote y Compose de accommodations-service)
- [ ] T096 Ejecutar integración real Bookings↔Payments para orden, confirmación, fallo y refund sin duplicados en `apps/bookings-service/test/contract/payments-provider.contract.spec.ts` y `apps/bookings-service/test/e2e/bookings-payments.e2e-spec.ts` (depends on T046–T052,T067–T068; external dependency: payments-service)
- [ ] T097 Ejecutar integración Gateway↔Bookings para rutas, identidad, roles, rate limit y Problem Details en `apps/bookings-service/test/e2e/gateway-bookings.e2e-spec.ts` (depends on T054,T060,T069,T077,T084; external dependency: API Gateway routing)
- [ ] T098 Ejecutar provider-consumer Bookings↔Reviews usando solo eligibility/evento y sin DB compartida en `apps/bookings-service/test/contract/reviews-provider.contract.spec.ts` y `apps/bookings-service/test/e2e/bookings-reviews.e2e-spec.ts` (depends on T088; external dependency: review_service consumer)
- [ ] T099 [P] Implementar shutdown ordenado de HTTP/workers/RabbitMQ/Prisma y probar SIGTERM, no-root y filesystem read-only en `apps/bookings-service/src/infrastructure/lifecycle/graceful-shutdown.ts` y `apps/bookings-service/test/contract/shutdown.contract.spec.ts`
- [ ] T100 Ejecutar todos los escenarios de `quickstart.md` y registrar comandos/exit codes/evidencia real, distinguiendo stubs de integración, en `specs/003-reservas-pagos-resenas/booking_service/quickstart.md` (depends on T089–T099)
- [ ] T101 Auditar trazabilidad RQ-07–RQ-10/RQ-11 parcial, cobertura >=70 %, contratos, Compose, CI, revisión humana y tareas externas no simuladas en `specs/003-reservas-pagos-resenas/booking_service/validation-report.md` (depends on T100)

---

## Dependencies & Execution Order

### Phase dependencies

- Phase 1 no tiene dependencias.
- Phase 2 depende de Phase 1 y bloquea implementación de historias.
- US1 es el MVP y provee el agregado/UoW usado por estados posteriores.
- US2 puede avanzar después de Foundation usando fixtures, aunque su demo real necesita una reserva de US1.
- US3 depende del agregado y UoW base de US1; Payments real no bloquea implementación con puerto.
- US4 history puede avanzar después de Foundation; cancelación OWNER reutiliza la UoW de US3.
- US5 puede diseñarse/probar con fixtures después de Foundation; transiciones reales dependen de Booking CONFIRMED de US1.
- Phase 8 integra únicamente historias seleccionadas y colaboradores disponibles.

### External dependency gates

| Gate | Tareas que pueden avanzar | Tarea que no se cierra sin externo |
|---|---|---|
| Accommodations quote | T031–T054 con stub/consumer contract | T095 |
| Payments | saga/ports/workers con stub | T096 |
| Gateway | controllers/security locales | T097 |
| review_service | T079–T088 y handoff contractual | T098 |
| Política productiva | infraestructura/fixture | T100–T101 para release productivo |

### User-story order

```text
Setup → Foundation → US1 MVP
                    ├── US2 detalle
                    ├── US3 cancelación GUEST → US4 cancelación OWNER
                    └── US5 lifecycle/review contract
Todos los incrementos seleccionados → Phase 8
```

## Parallel Execution Examples

### Foundation

- Persona A: T012–T016 dominio.
- Persona B: T017–T021 persistencia/migraciones.
- Persona C: T022–T025 seguridad/HTTP.
- Persona D: T026–T029 observabilidad/contratos/health.

### US1

- Tests T031–T037 pueden escribirse en paralelo.
- Persistencia T041–T043 y clientes T039–T040/T045–T048 avanzan en paralelo después de contratos.
- Mensajería T049–T052 avanza cuando están listos schema/UoW.

### Paralelo con review_service

- El equipo Reviews puede usar desde el inicio `contracts/booking-payment-events-v1.schema.json`, `openapi-bookings-service.yaml` y la semántica RQ-11 parcial.
- Bookings ejecuta T079–T088 sin imports ni tablas de Reviews.
- Reviews construye su consumer contra fixtures versionadas; únicamente T098 requiere ambos servicios operativos.
- Cambiar el contrato después de T088 exige revisión de compatibilidad coordinada, no acceso al código interno del otro equipo.

## Implementation Strategy

### MVP

1. T001–T030: Setup + Foundation.
2. T031–T054: US1.
3. Detener y demostrar concurrencia, idempotencia y saga aislada antes de ampliar.

### Incremental

1. Añadir US2 para detalle seguro.
2. Añadir US3 y US4 para RQ-09/RQ-08/RQ-10.
3. Añadir US5 para lifecycle y desbloquear Reviews.
4. Ejecutar Phase 8 solo con integraciones externas realmente disponibles.

## Notes

- `[P]` nunca implica ignorar `depends on` explícito.
- Ninguna tarea autoriza cambios funcionales en otros microservicios.
- Tareas externas permanecen sin marcar hasta tener evidencia conjunta real.
- El plan técnico y los contratos son fuente para decisiones; `tasks.md` no redefine política de producto.
- No afirmar Sprint 3 end-to-end si Payments, Gateway, Accommodations quote o Reviews siguen simulados.



