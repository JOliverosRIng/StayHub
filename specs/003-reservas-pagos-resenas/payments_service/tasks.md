# Tasks: Payments Service de StayHub

**Input**: documentos de diseño en `specs/003-reservas-pagos-resenas/payments_service/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`  
**Scope**: exclusivamente `payments-service`; no incluye frontend, API Gateway ni implementación de `bookings-service`  
**Prefijo de IDs**: `PAY-###` (equivalente a `USR-###` y `ACC-###` de los otros servicios)

## Trazabilidad

| Historia | Requisito fuente | Cobertura |
|---|---|---|
| **US1 - Cobrar una reserva (P1)** | RQ-07 parcial, PAY-FR-001–007, 012, 014–016 | Cobro con pasarela mock, idempotencia y un pago activo por reserva. |
| **US2 - Consultar estado (P1)** | RQ-07 parcial, PAY-FR-001, 014–015 | Estado con autorización por dueño, admin o servicio. |
| **US3 - Reembolsar (P1)** | RQ-09 y RQ-10 parciales, PAY-FR-005, 008–010 | Reembolso total o parcial con saldo protegido. |
| **US4 - Eventos confiables (P2)** | PAY-FR-011, 018; principio IV | Outbox transaccional y publicación RabbitMQ. |
| **US5 - Reconciliación (P2)** | PAY-FR-013; RNF Disponibilidad | Resolución de pagos y reembolsos `PENDING`. |
| **Transversal** | PAY-NFR-001–008 | Rendimiento, seguridad, contratos, cobertura, Docker y evidencia. |

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: puede ejecutarse en paralelo porque afecta archivos distintos y no depende de otra tarea incompleta de la fase.
- **[US1]…[US5]**: historia a la que aporta la tarea.
- **[compartido]**: toca archivos fuera de `apps/payments-service` y `specs/003-…`; requiere aprobación del equipo y un commit separado.
- Las tareas **RED** escriben pruebas antes de implementar: verificar que fallan por la ausencia de comportamiento. Se permite que esas pruebas nuevas permanezcan en rojo durante los commits RED; **no** se simulan, desactivan ni marcan como exitosas. Reportar la evidencia real. `lint` y `typecheck` deben quedar limpios si es posible; indicar cualquier bloqueo real.
- Las tareas **GREEN** implementan lo mínimo necesario y deben dejar verdes las pruebas de la historia habilitadas hasta ese momento, `lint` y `typecheck` y sin regresiones. Las pruebas de historias futuras no se ejecutan como criterio de la presente.
- La fase de bootstrap PAY-001…PAY-030 permite una progresión instalable: los comandos aún inexistentes no se declaran exitosos. PAY-001 crea archivos locales; PAY-002 integra workspace/lockfile. PAY-030 completa el primer entorno desplegable.
- Ciclo: una tarea a la vez, salida real de comandos existentes, `git diff --stat` antes del commit, commit `feat(payments): PAY-### …`; **sin push automático**. Las tareas `[compartido]` requieren diff propuesto y aprobación previa en ese mismo turno. En PR no se permite estado RED ni omitir gates.

---

## Phase 1: Setup del microservicio

**Purpose**: crear una base ejecutable consistente con Users y Search.

- [x] PAY-001 Crear el workspace `@stayhub/payments-service` con scripts `build`, `start`, `start:dev`, `lint`, `typecheck`, `test`, `test:unit|integration|contract|security|performance`, `test:coverage`, `prisma:generate`, `prisma:migrate:dev`, `prisma:migrate:deploy`, y fijar NestJS 10.4.22, TypeScript 5.7.3, Prisma 6.19.0, `@nestjs/swagger` 8.1.1, `class-validator` 0.14.2, `class-transformer` 0.5.1, `jsonwebtoken` 9.0.2, Jest 29.7 y Supertest 7 en `apps/payments-service/package.json`
- [x] PAY-002 [compartido] Registrar `apps/payments-service` en workspaces y añadir scripts raíz `build:payments`, `lint:payments`, `typecheck:payments`, `test:payments:*`, `prisma:payments:*` sin alterar Auth, Users ni Search en `package.json` y `package-lock.json`
- [x] PAY-003 [P] Crear configuración TypeScript estricta y alias `@payments/*` siguiendo las convenciones del monorepo en `apps/payments-service/tsconfig.json` y `apps/payments-service/tsconfig.build.json`
- [x] PAY-004 [P] Configurar proyectos Jest `unit`, `integration`, `contract`, `security` y `performance`, cobertura global mínima de 70 % y setup aislado por suite en `apps/payments-service/jest.config.ts` y `apps/payments-service/test/{unit,integration,contract,security,performance}/setup.ts`
- [x] PAY-005 [compartido] Registrar `payments-service` como aplicación NestJS con `root`, `sourceRoot`, `entryFile` y `tsConfigPath` propios en `nest-cli.json`
- [x] PAY-006 [P] [compartido] Crear el Dockerfile multi-stage no root con targets `build`, `migration` y `runtime` en `infra/docker/payments/Dockerfile`
- [x] PAY-007 [P] [compartido] Añadir las variables `PAYMENTS_*` documentadas con valores de ejemplo no secretos (ver `plan.md`, sección Configuración) en `.env.example`
- [x] PAY-008 [P] Crear `apps/payments-service/README.md` con comandos, variables, tokens mock (`tok_approved`, `tok_declined_funds`, `tok_declined_fraud`, `tok_gateway_timeout`, `tok_gateway_down`, `tok_refund_fails`) y enlace a los documentos del spec

**Checkpoint**: PAY-001 crea el esqueleto local; PAY-002 (aprobado por el equipo) registra el workspace y actualiza el lockfile. Solo después de PAY-002 se exige `npm ci` desde la raíz sin inconsistencias. No marcar el setup como completo antes de resolver la dependencia.

---

## Phase 2: Fundamentos bloqueantes

**Purpose**: configuración, persistencia, dominio base, seguridad, HTTP, observabilidad y entorno local compartidos por las cinco historias.

**⚠️ CRITICAL**: ninguna historia comienza antes de completar esta fase.

### Configuración y persistencia

- [x] PAY-009 Implementar configuración tipada y validada que falle al arrancar si falta el secreto HMAC (< 32 caracteres), las claves JWT, la URL de base de datos o la lista de monedas, con pruebas unitarias, en `apps/payments-service/src/infrastructure/config/{payments-config.ts,config.module.ts}`
- [x] PAY-010 Definir Prisma (`payments`, `refunds`, `idempotency_records`, `outbox_events`, `payment_status_history`, `refund_status_history`, `mock_gateway_operations` solo dev/test, enums) y migración SQL `001_payments_core`: montos `BIGINT` seguros con `CHECK` de rango, `CHECK (refunded_amount_minor BETWEEN 0 AND amount_minor)`, índice parcial único de pago con `REVIEW_REQUIRED`, índice parcial único de reembolso `PENDING|REVIEW_REQUIRED`, índice único del ledger mock y los índices de reconciliador/outbox según `data-model.md` en `apps/payments-service/prisma/{schema.prisma,migrations/001_payments_core/migration.sql}`
- [x] PAY-011 Implementar `PrismaService`, `PrismaModule`, mapeo de errores de base de datos a indisponibilidad (`database-error.ts`) y `UnitOfWork` transaccional con aislamiento explícito en `apps/payments-service/src/infrastructure/persistence/prisma/` y `src/application/ports/unit-of-work.ts`

### Dominio (sin framework)

- [x] PAY-012 Crear `DomainError` con códigos estables (`VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `IDEMPOTENCY_CONFLICT`, `STATE_CONFLICT`, `REFUND_AMOUNT_INVALID`, `UNAVAILABLE`) y `FieldError` en `apps/payments-service/src/domain/shared/domain-error.ts`
- [x] PAY-013 [P] Implementar `Money` (entero seguro hasta 9 000 000 000 000, COP/USD = 2 decimales, sin overflow, suma, resta y comparación, rechazo de negativos/no enteros) con pruebas unitarias en `apps/payments-service/src/domain/shared/money.ts` y `test/unit/domain/money.spec.ts`
- [x] PAY-014 [P] Implementar `PaymentStatus` con `REVIEW_REQUIRED` (no terminal), transiciones solo con evidencia y tabla de transiciones de `data-model.md` con una prueba exhaustiva de la matriz completa (válidas e inválidas) en `apps/payments-service/src/domain/payments/payment-status.ts` y `test/unit/domain/payment-status.spec.ts`
- [x] PAY-015 Implementar `Payment` (`approve`, `decline`, `markFailed` solo pre-dispatch probado, `markReviewRequired`, `applyRefund`) que usa `PaymentStatus` y mantiene `refundedAmount <= amount`, con pruebas unitarias, en `apps/payments-service/src/domain/payments/{payment.entity.ts,payment.policy.ts}`
- [x] PAY-016 [P] Implementar `Refund` y `RefundPolicy` (incluye `REVIEW_REQUIRED` bloqueante y transiciones auditadas solo con evidencia, saldo reembolsable, monto omitido = saldo completo, `OWNER_CANCELLATION` exige saldo completo, estados válidos del pago) con pruebas unitarias en `apps/payments-service/src/domain/refunds/`

### Puertos y utilidades de aplicación

- [x] PAY-017 Definir puertos `PaymentRepository`, `RefundRepository`, `IdempotencyRepository`, `OutboxRepository`, `PaymentGatewayPort` (`charge`, `refund`, `getTransaction`, distinguiendo no despacho de resultado incierto), `ClockPort` y `UnitOfWork` en `apps/payments-service/src/application/ports/`
- [x] PAY-018 Crear los errores de aplicación y el mapeo `DomainError → Problem Details` (`application/problem+json`, campos `type`, `title`, `status`, `detail`, `instance`, `code`, `traceId`, `errors`) con la tabla de estados de `research.md` R-09 y pruebas en `apps/payments-service/src/application/errors/payments-errors.ts` y `src/interfaces/http/{problem.mapper.ts,problem.filter.ts}`
- [x] PAY-019 [P] Implementar serialización JSON canónica (claves ordenadas) y huella SHA-256 del cuerpo con pruebas de estabilidad en `apps/payments-service/src/infrastructure/security/request-fingerprint.ts`
- [x] PAY-020 [P] Implementar la huella HMAC-SHA-256 del token de pago con secreto de configuración y pruebas de que el token en claro nunca aparece en el resultado en `apps/payments-service/src/infrastructure/security/token-fingerprint.ts`

### Seguridad, HTTP y operación

- [x] PAY-021 Implementar verificación JWT RS256 de usuario y de servicio (`alg`, `kid`, `iss`, `aud`, `exp`, edad máxima, scopes) replicando `apps/users-service/src/infrastructure/security/service-jwt.verifier.ts`, con pruebas con claves RSA generadas en el test, en `apps/payments-service/src/infrastructure/security/jwt.verifier.ts` y `src/interfaces/http/auth/jwt.strategy.ts`
- [x] PAY-022 Implementar `ServiceAuthGuard` (scope exacto por ruta), `RolesGuard` y `@Roles()` replicando `apps/users-service/src/interfaces/http/guards/`, con pruebas unitarias, en `apps/payments-service/src/interfaces/http/guards/`
- [x] PAY-023 Configurar el bootstrap HTTP: `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`, límite de cuerpo de 8 KB, filtro de Problem Details, interceptor de traza y cierre ordenado (drena HTTP antes de liberar Prisma) en `apps/payments-service/src/{main.ts,app.module.ts}` y `src/interfaces/http/{configure-http.ts,validation.pipe.ts,trace.interceptor.ts}`
- [x] PAY-024 [P] Implementar el logger JSON con redacción recursiva de `token`, `paymentMethod`, `authorization`, `idempotency-key` y cualquier cadena de 13–19 dígitos, con prueba de seguridad dedicada, en `apps/payments-service/src/infrastructure/logging/payments-logger.ts` y `test/security/log-redaction.spec.ts`
- [ ] PAY-025 [P] Configurar OpenTelemetry (trazas HTTP, DB y gateway; exportador OTLP tolerante a colector apagado) en `apps/payments-service/src/infrastructure/observability/otel.ts`
- [ ] PAY-026 Implementar `GET /health/live` y `GET /health/ready` (base de datos, migración aplicada; RabbitMQ degradado no bloquea) con pruebas de integración en `apps/payments-service/src/modules/health/`
- [ ] PAY-027 Crear la fábrica OpenAPI 3.1 (`openapi.factory.ts`, `schemas.ts`) y la prueba de contrato base que compara el documento generado con `contracts/openapi-payments-service.yaml` en `apps/payments-service/src/interfaces/openapi/` y `test/contract/openapi-drift.spec.ts`
- [ ] PAY-028 Implementar `MockPaymentGatewayAdapter` determinista **con ledger durable** `mock_gateway_operations`: `tok_gateway_timeout` persiste el resultado antes de perder la respuesta, `tok_gateway_down` falla antes de despachar, `getTransaction` consulta desde instancia nueva, y operación repetida devuelve resultado del ledger; circuito con timeout y pruebas unitarias/integración de reinicio en `apps/payments-service/src/infrastructure/gateway/`
- [ ] PAY-029 Crear fixtures/arnés: JWT RSA de usuario/servicio, factorías, fixtures del ledger mock y PostgreSQL 16 desechable (migraciones desde cero, escenario crash-restart `charge → ledger confirmado → servicio cae`), sin marcar pruebas de integración como pasadas con mocks en `apps/payments-service/test/fixtures/{jwt.fixture.ts,payments.fixture.ts,mock-gateway.fixture.ts}` y `test/integration/setup.ts`
- [ ] PAY-030 [compartido] Añadir `payments-db`, `payments-migrate` y `payments-service` a `docker-compose.yml` con red `payments-internal` + `services`, secretos por archivo, health check a `/health/ready`, `restart: always` en `payments-service` y dependencia blanda de RabbitMQ

**Checkpoint**: el servicio compila, arranca, responde `ready` con PostgreSQL real y rechaza toda petición sin JWT válido. Las historias pueden empezar.

---

## Phase 3: User Story 1 - Cobrar una reserva (Priority: P1) 🎯 MVP

**Goal**: cobrar contra la pasarela mock con resultado autoritativo, idempotencia y un pago activo por reserva.

**Independent Test**: enviar cobros con cada token mock y reintentos concurrentes; verificar estado persistido, respuesta HTTP y una sola llamada a la pasarela por clave.

### Pruebas primero

- [ ] PAY-031 [P] [RED] [US1] Escribir pruebas unitarias del caso de uso `CreatePayment`: aprobado, rechazado, resultado ambiguo, reproducción idempotente, conflicto de huella, pago activo existente y pasarela no disponible en `apps/payments-service/test/unit/create-payment.use-case.spec.ts`
- [ ] PAY-032 [P] [RED] [US1] Escribir pruebas de integración con PostgreSQL real: el índice parcial impide dos pagos activos por reserva; N peticiones simultáneas con la misma clave producen un solo pago y una sola llamada a la pasarela; reintento tras `DECLINED` está permitido en `apps/payments-service/test/integration/create-payment.spec.ts`
- [ ] PAY-033 [P] [RED] [US1] Escribir pruebas de contrato de `POST /payments` para 201, 202, 400, 401, 403, 409 y 503 contra `contracts/openapi-payments-service.yaml` en `apps/payments-service/test/contract/create-payment.contract.spec.ts`
- [ ] PAY-034 [P] [RED] [US1] Escribir pruebas de seguridad: sin JWT, JWT expirado, `alg: none`, `kid` desconocido, audiencia incorrecta, JWT de usuario llamando al cobro (403), scope equivocado (403), campos extra, token con formato de PAN, cuerpo sobredimensionado y ausencia de secretos en logs en `apps/payments-service/test/security/create-payment.security.spec.ts`

### Implementación

- [ ] PAY-035 [GREEN] [US1] Implementar `PaymentRepository` Prisma con historial inmutable de pagos y `OutboxRepository` mínimo (persistencia atómica; relay NO) más constructores de eventos aprobados/rechazados/failed en `src/application/events/payment-events.ts` y mapeo de índice parcial a `STATE_CONFLICT`. Verificar que `gateway_reference`/claves nunca aparezcan en eventos o logs.
- [ ] PAY-036 [P] [GREEN] [US1] Implementar `IdempotencyRepository` (reservar, completar, liberar **solo** en 503 pre-dispatch probado; no purgar en `PENDING|REVIEW_REQUIRED`, replay original) con índice único `(scope, key, caller_subject)` en `apps/payments-service/src/infrastructure/persistence/prisma/idempotency.repository.ts`
- [ ] PAY-037 [GREEN] [US1] Implementar `CreatePayment` con transacciones separadas: reservar clave + PENDING → llamada a pasarela/ledger mock fuera de tx → resultado + historial + evento outbox en misma tx; timeout = PENDING con 202 y clave retenida; probar caída tras cargo antes del commit en `apps/payments-service/src/application/payments/create-payment.use-case.ts`
- [ ] PAY-038 [GREEN] [US1] Implementar DTO estricto, controlador `POST /payments`, cabeceras `Idempotent-Replay` y `Location`, y decoradores OpenAPI en `apps/payments-service/src/interfaces/http/payments/{create-payment.dto.ts,payments.controller.ts}` y `src/interfaces/openapi/payments.openapi.ts`
- [ ] PAY-039 [GREEN] [US1] Registrar `PaymentsModule` y conectarlo a `AppModule` con las dependencias de puertos en `apps/payments-service/src/modules/payments.module.ts`
- [ ] PAY-040 [GREEN] [US1] Implementar `503` **solo con prueba de no despacho**: pago `FAILED/GATEWAY_UNAVAILABLE`, clave liberada, nuevo intento permitido; si existe posibilidad de despacho, `202 PENDING` con bloqueo y clave retenida. Añadir pruebas adversariales de caída de red después del cargo, en `apps/payments-service/src/application/payments/create-payment.use-case.ts`

**Checkpoint**: US1 funciona y se verifica de forma independiente.

---

## Phase 4: User Story 2 - Consultar el estado de un pago (Priority: P1)

**Goal**: devolver el estado del pago solo a quien corresponde.

**Independent Test**: pagos en cada estado consultados por dueño, ajeno, admin y servicio.

- [ ] PAY-041 [P] [RED] [US2] Escribir pruebas unitarias y de seguridad: dueño (200), admin (200), servicio con `payments:read` (200), usuario ajeno (404 idéntico a inexistente), identificador malformado (400), scope insuficiente (403) en `apps/payments-service/test/unit/get-payment-status.use-case.spec.ts` y `test/security/get-payment-status.security.spec.ts`
- [ ] PAY-042 [P] [RED] [US2] Escribir la prueba de contrato de `GET /payments/{id}/status`: esquema `PaymentStatus`, `Cache-Control: no-store` y ausencia de `gatewayReference`, token y huella en `apps/payments-service/test/contract/get-status.contract.spec.ts`
- [ ] PAY-043 [GREEN] [US2] Implementar el caso de uso `GetPaymentStatus` con la política de visibilidad (dueño, `ADMIN`, servicio) en `apps/payments-service/src/application/payments/get-payment-status.use-case.ts`
- [ ] PAY-044 [GREEN] [US2] Implementar `GET /payments/{id}/status` con autenticación dual (JWT de usuario o JWT de servicio con scope `payments:read`) y OpenAPI en `apps/payments-service/src/interfaces/http/payments/payments.controller.ts`

**Checkpoint**: US1 y US2 funcionan juntas. Con esto el flujo "pagar y consultar" ya es demostrable.

---

## Phase 5: User Story 3 - Reembolsar un pago (Priority: P1)

**Goal**: reembolsos totales y parciales que nunca superan el monto pagado.

**Independent Test**: reembolsos secuenciales y concurrentes sobre pagos aprobados.

### Pruebas primero

- [ ] PAY-045 [P] [RED] [US3] Escribir pruebas unitarias del caso de uso `RefundPayment`: total, parcial, monto mayor al saldo, `OWNER_CANCELLATION` con monto parcial, estados no reembolsables, rechazo de la pasarela, idempotencia en `apps/payments-service/test/unit/refund-payment.use-case.spec.ts`
- [ ] PAY-046 [P] [RED] [US3] Escribir pruebas de integración de concurrencia con PostgreSQL real: dos reembolsos simultáneos que juntos exceden el monto (solo uno se aplica), el `CHECK` rechaza un `UPDATE` directo que lo supere, el índice impide dos reembolsos `PENDING` por pago en `apps/payments-service/test/integration/refund-concurrency.spec.ts`
- [ ] PAY-047 [P] [RED] [US3] Escribir la prueba de contrato de `POST /payments/{id}/refund` para 201, 202, 400, 401, 403, 404, 409, 422 y 503 en `apps/payments-service/test/contract/refund.contract.spec.ts`
- [ ] PAY-048 [P] [RED] [US3] Escribir pruebas de seguridad: JWT de usuario (403), scope `payments:charge` en la ruta de reembolso (403), reutilizar una clave de idempotencia de **otro pago** (scope `refund:<paymentId>` independiente → operación distinta, nunca replay cruzado; misma clave y mismo paymentId con cuerpo distinto → 409), campos extra y motivo inválido en `apps/payments-service/test/security/refund.security.spec.ts`

### Implementación

- [ ] PAY-049 [GREEN] [US3] Implementar `RefundRepository` Prisma con escritura de `refund_status_history` atómica y el bloqueo `SELECT … FOR UPDATE` del pago dentro de la transacción de reembolso en `apps/payments-service/src/infrastructure/persistence/prisma/refund.repository.ts`
- [ ] PAY-050 [GREEN] [US3] Implementar `RefundPayment`: tx1 bloquear/validar + reembolso PENDING → **cerrar tx** → pasarela fuera de tx → tx2 resultado definitivo + ambos historiales que correspondan + evento outbox (constructores refunded/refund_failed); timeout → PENDING (y posible REVIEW_REQUIRED solo después de reconciliación), preservando bloqueo en `apps/payments-service/src/application/refunds/refund-payment.use-case.ts`
- [ ] PAY-051 [GREEN] [US3] Implementar DTO estricto, controlador `POST /payments/{id}/refund`, cabeceras de idempotencia y decoradores OpenAPI en `apps/payments-service/src/interfaces/http/refunds/{refund-payment.dto.ts,refunds.controller.ts}` y `src/modules/refunds.module.ts`
- [ ] PAY-052 [GREEN] [US3] Implementar el resultado ambiguo del reembolso: respuesta `202` con `PENDING`, rechazo de nuevos reembolsos con `409` mientras exista uno pendiente, con su prueba, en `apps/payments-service/src/application/refunds/refund-payment.use-case.ts`

**Checkpoint**: US1, US2 y US3 ofrecen un corte funcional de cobro → consulta interna → reembolso, con outbox escrito pero **sin publicación RabbitMQ garantizada** (US4) ni reconciliador completo (US5). No prometer resolución automática de pendientes ni acceso web en este corte.

---

## Phase 6: User Story 4 - Eventos de pago confiables (Priority: P2)

**Goal**: publicar hechos de pago sin pérdida silenciosa.

**Independent Test**: provocar caídas del broker y comprobar entrega al menos una vez, orden por pago y estado `DEAD` visible.

- [ ] PAY-053 [P] [RED] [US4] Escribir pruebas unitarias de los constructores de eventos validando cada evento contra `contracts/payment-events-v1.schema.json` (JSON Schema 2020-12) y la ausencia de token, correo y datos personales en `apps/payments-service/test/unit/payment-events.spec.ts`
- [ ] PAY-054 [P] [RED] [US4] Escribir pruebas de integración de atomicidad: si la transacción de cobro o reembolso falla, no queda evento; si confirma, el evento existe en `outbox_events` en `apps/payments-service/test/integration/outbox-atomicity.spec.ts`
- [ ] PAY-055 [P] [RED] [US4] Escribir pruebas de integración con RabbitMQ real: publisher confirms, broker caído y recuperado, orden por `aggregate_id`, paso a `DEAD` tras el máximo de intentos en `apps/payments-service/test/integration/outbox-relay.spec.ts`
- [ ] PAY-056 [GREEN] [US4] Auditar/refactorizar constructores de eventos ya incorporados en PAY-035 y PAY-050; completar nuevos eventos `review_required`/`refund_review_required` (incluyendo `refundAmountMinor` aún incierto), probar contrato JSON Schema y **demostrar** que US1/US3 ya escribían outbox atómico antes de activar relay. No posponer la escritura al completar US4
- [ ] PAY-057 [GREEN] [US4] Completar `OutboxRepository` y el relay (lotes con `FOR UPDATE SKIP LOCKED`, backoff exponencial con tope, estados `PENDING`/`PUBLISHED`/`DEAD`) en `apps/payments-service/src/infrastructure/persistence/prisma/outbox.repository.ts`, `src/infrastructure/messaging/outbox.relay.ts` y `src/application/events/publish-outbox.use-case.ts`
- [ ] PAY-058 [GREEN] [US4] Implementar el publicador RabbitMQ con canal de confirmación, declaración del exchange `topic` durable `stayhub.payments`, reconexión y `OutboxModule` en `apps/payments-service/src/infrastructure/messaging/rabbitmq.publisher.ts` y `src/modules/outbox.module.ts`
- [ ] PAY-059 [GREEN] [US4] Añadir métricas `payments_outbox_pending` y `payments_outbox_dead`, estado `degraded` de RabbitMQ en readiness sin bloquear lecturas y purga de eventos `PUBLISHED` según retención en `apps/payments-service/src/modules/health/` y `src/infrastructure/messaging/`

**Checkpoint**: Bookings y Notifications ya pueden consumir el contrato de eventos.

---

## Phase 7: User Story 5 - Reconciliar pendientes (Priority: P2)

**Goal**: que ningún pago ni reembolso quede `PENDING` indefinidamente.

**Independent Test**: sembrar pendientes antiguos y simular el resultado final en la pasarela mock.

- [ ] PAY-060 [P] [RED] [US5] Escribir pruebas del reconciliador con PostgreSQL real: definitivos pago/reembolso, agotamiento **a REVIEW_REQUIRED (no FAILED)** con `RECONCILIATION_EXHAUSTED`, bloqueo que impide segundo cobro/reembolso, evento de revisión, dos instancias con `SKIP LOCKED` sin doble procesamiento y sin transacción SQL abierta al consultar pasarela; recurso ya resuelto sin cambios en `apps/payments-service/test/integration/reconciler.spec.ts`
- [ ] PAY-061 [GREEN] [US5] Validar y reforzar `getTransaction` del mock durable iniciado en PAY-028: fixtures de resultado confirmado/UNKNOWN y pruebas entre instancias y tras reinicio; nunca inferir rechazo por ausencia de registro
- [ ] PAY-062 [GREEN] [US5] Implementar `ReconcilePending` + scheduler: reclamar lotes con `SKIP LOCKED`, cerrar tx antes de la consulta, backoff y presupuesto; definitivo → estado final y evento outbox, incierto agotado → REVIEW_REQUIRED + evento + registro auditable, nunca reintentar el cobro ciegamente. Documentar escalamiento operativo para revisar evidencia, sin implementar un endpoint de override ni desbloquear estados desconocidos sin prueba en `apps/payments-service/src/application/payments/reconcile-pending.use-case.ts` y `src/modules/reconciler.module.ts`
- [ ] PAY-063 [P] [GREEN] [US5] Añadir la métrica `payments_pending_age_seconds` y el log estructurado de cada resolución (sin datos sensibles) en `apps/payments-service/src/application/payments/reconcile-pending.use-case.ts`

**Checkpoint**: las cinco historias funcionan de forma independiente.

---

## Phase 8: Transversal y cierre

**Purpose**: gates técnicos, evidencia y entrega.

- [ ] PAY-064 [P] Escribir y ejecutar pruebas de rendimiento reproducibles de `GET /payments/{id}/status` y `POST /payments` con mock: p95 < 500 ms, con el perfil documentado en `apps/payments-service/test/performance/payments.performance.spec.ts`
- [ ] PAY-065 [compartido] Crear `scripts/validate-payments-openapi.mjs`, prueba de drift OpenAPI 3.1 y JSON Schema, y **añadir job `payments-quality` a `.github/workflows/ci.yml`** con filtro `apps/payments-service/**`, filtro `specs/003-reservas-pagos-resenas/payments_service/**`, ejecución de instalación/workspace y `lint`, `typecheck`, `test:coverage`, contrato, `build` (y PostgreSQL 16 real para integración), sin borrar jobs existentes. Antes de editar raíz/workflow, presentar diff propuesto y esperar aprobación del equipo
- [ ] PAY-066 [P] Ejecutar un barrido de seguridad: correr todas las suites de integración capturando logs y comprobar que no aparecen tokens, claves de idempotencia, `Authorization` ni cadenas con forma de PAN en `apps/payments-service/test/security/log-sweep.spec.ts`
- [ ] PAY-067 Ejecutar `lint`, `typecheck`, `build` y `test:coverage` completos y confirmar cobertura global ≥ 70 % (statements, branches, functions, lines) sin suites omitidas
- [ ] PAY-068 [compartido] Validar en Docker Compose desde cero: base+migración levantan, servicio `ready` sin RabbitMQ (`degraded`), reinicio automático (`restart: always`), pagos y ledger mock persisten; verificar que ninguna prueba usa dependencias falsas en vez de PostgreSQL/RabbitMQ cuando son necesarios, documentar resultados reales
- [ ] PAY-069 [P] Crear `apps/payments-service/test/fixtures/CONSUMER-HANDOFF.md` con ejemplos de cobro, reembolso y eventos para Bookings y Notifications, scopes requeridos y semántica de reintento, como hace `users-service`
- [ ] PAY-070 Crear `specs/003-reservas-pagos-resenas/payments_service/validation-report.md` con evidencia por requisito `PAY-FR-###` y `PAY-NFR-###`, resultados reales de pruebas, y una declaración honesta de qué RQ quedan solo parcialmente cubiertos hasta integrar Bookings

---

## Dependencias y orden de ejecución

- **Phase 1 → Phase 2 → historias**. Phase 2 bloquea todo.
- **US1** es prerequisito práctico de US2 y US3 (necesitan pagos creados), pero sus **pruebas** se pueden escribir en paralelo.
- **US3** depende de PAY-035 (repositorio de pagos) y PAY-036 (idempotencia).
- **US4** completa relay y publicación. US1/US3 **ya** deben encolar outbox en la transacción de estado (PAY-035/PAY-037/PAY-050); PAY-056 refuerza los contratos, no incorpora eventos tarde.
- **US5** depende de US4 para publicar eventos y de PAY-028 (mock durable) y PAY-061 (`getTransaction` robusto).
- Tareas `[P]` de una misma fase pueden ir en paralelo **solo si no alteran el mismo archivo**; para Codex se ejecutan secuencialmente una por una. Las `[compartido]` requieren aprobación previa y commit aislado por tarea.
- **PAY-001→PAY-002** es una dependencia de bootstrap; no exigir `npm ci` raíz entre ambas. **PAY-065** agrega CI después de que los scripts existan.
- **Precondición documental**: el Spec Kit debe estar copiado, revisado y commiteado en la rama de trabajo antes de PAY-001; nunca usar una carpeta temporal como fuente de verdad.

## Estrategia de implementación

1. **Corte funcional provisional**: PAY-001…PAY-052. Mostrar cobrar → consultar (internamente) → reembolsar, con eventos escritos en outbox pero **no entregados** hasta US4 y sin resolver automáticamente pendientes hasta US5. No cerrar una entrega productiva así.
2. US4 entrega relay RabbitMQ y semántica at-least-once, con eventos grabados desde US1/US3.
3. US5 entrega reconciliación, bloqueo conservado y escalamiento seguro a `REVIEW_REQUIRED`; luego fase transversal y CI.
4. Si se posterga US4/US5, reportarlo como deuda bloqueante para flujos de reserva reales, sin afirmar cobertura end-to-end.
