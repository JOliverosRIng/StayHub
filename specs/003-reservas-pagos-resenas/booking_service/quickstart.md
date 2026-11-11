# Quickstart de validación: bookings-service

Esta guía define evidencia esperada; no afirma que el código exista todavía.

## 1. Prerrequisitos

- Node 20, Docker Desktop y Docker Compose.
- PostgreSQL 16 para `bookings_db`.
- RabbitMQ 3 con vhost/usuario de mínimo privilegio.
- contratos en `contracts/` congelados.
- claves sintéticas de prueba; nunca secretos reales versionados.
- adaptador contractual de Accommodations y cliente REST de Payments alineado con `POST /payments` y `POST /payments/{id}/refund`; la prueba compuesta real sigue pendiente.

## 2. Configuración mínima

Variables previstas:

```text
BOOKINGS_PORT=3005
BOOKINGS_DATABASE_URL_FILE=/run/secrets/bookings_database_url
BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON=...
BOOKINGS_SERVICE_JWT_ISSUER=stayhub-gateway
BOOKINGS_SERVICE_JWT_AUDIENCE=stayhub-bookings-service
BOOKINGS_SERVICE_JWT_SCOPE=bookings:invoke
BOOKINGS_ACCOMMODATIONS_URL=http://accommodations-service:3003
BOOKINGS_PAYMENTS_URL=http://payments-service:3006
BOOKINGS_DEPENDENCY_TIMEOUT_MS=3000
BOOKINGS_PAYMENT_HOLD_MINUTES=<valor aprobado por producto/operación>
BOOKINGS_CANCELLATION_POLICY_VERSION=<versión aprobada>
BOOKINGS_RABBITMQ_URL_FILE=/run/secrets/bookings_rabbitmq_url
BOOKINGS_RABBITMQ_EXCHANGE=stayhub.bookings.v1
BOOKINGS_RABBITMQ_QUEUE=stayhub.bookings.payment-events.v1
BOOKINGS_RABBITMQ_DLQ=stayhub.bookings.payment-events.v1.dlq
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

La aplicación debe fallar al arranque si faltan valores obligatorios o son inválidos.

## 3. Gates locales previstos

```powershell
npm run prisma:bookings:generate
npm run lint:bookings
npm run typecheck:bookings
npm run test:bookings:unit
npm run test:bookings:contract
npm run build:bookings
```

Resultados: exit `0`, contrato OpenAPI/JSON Schema sin drift y cobertura de dominio afectado >= 70 %.

## 4. Migraciones y dependencias reales

```powershell
docker compose up -d bookings-db rabbitmq
npm run prisma:bookings:migrate:deploy
npm run test:bookings:integration
```

Verificar:

- migración desde base vacía;
- `btree_gist` y constraint de exclusión existentes;
- índices de huésped/propietario/hold/outbox;
- readiness `503` sin DB o migración y `200` con esquema correcto;
- RabbitMQ caído se refleja como degradación/indisponibilidad del flujo, sin pérdida silenciosa.

## 5. Escenario crítico: concurrencia

1. Preparar una cotización contractual para la misma habitación.
2. Enviar simultáneamente dos `POST /bookings` con huéspedes/claves distintas y fechas superpuestas.
3. Esperar una creación y un `409 BOOKING_CONFLICT`.
4. Confirmar una sola fila bloqueante y una sola orden de pago.
5. Repetir con rangos contiguos: `[1,3)` y `[3,5)` deben ser válidos.

Este escenario debe ejecutarse contra PostgreSQL real, no repositorio en memoria.

## 6. Idempotencia

- Mismo huésped, clave y payload: misma reserva y una orden de pago.
- Misma clave con payload distinto: `409 IDEMPOTENCY_CONFLICT`.
- Retry después de timeout de Payments: el reconciliador reusa la clave y no duplica la orden.

## 7. Pago y expiración

- `payment.v1.confirmed` válido: `PENDING_PAYMENT → CONFIRMED`.
- Evento duplicado: no-op idempotente.
- Evento con mismo `eventId` y hash distinto: conflicto/DLQ.
- `payment.v1.failed`: `PAYMENT_FAILED` y disponibilidad liberada.
- Hold vencido sin confirmación: `EXPIRED`; confirmación tardía se rechaza/compensa según contrato financiero.

## 8. Cancelación

- GUEST propio y política elegible: `CANCELLED_BY_GUEST`.
- GUEST ajeno: `404`.
- Política no elegible: `409 CANCELLATION_NOT_ALLOWED`.
- OWNER propio con justificación: `CANCELLED_BY_OWNER` y refund `FULL`.
- OWNER sin justificación: `400`.
- Cancelación repetida: resultado idempotente o conflicto estable, sin doble reembolso.

Los tests usan una política fixture; no presentan sus valores como política productiva.

## 9. Historial, check-in y review

- Historial filtra por `ownerId` snapshot, fecha, estado y huésped; no devuelve reservas ajenas.
- Orden y paginación son deterministas.
- Solo `CONFIRMED` admite check-in; solo `CHECKED_IN` admite check-out.
- Check-out produce `COMPLETED` y elegibilidad positiva solo para `guestId`/propiedad correctos.

## 10. Compose y seguridad

```powershell
docker compose up -d bookings-db bookings-migrate rabbitmq bookings-service
docker compose ps
```

Comprobar usuario no-root, filesystem de solo lectura cuando sea viable, `restart: always`, secrets por archivo, puerto 3005 solo interno, `/health/live`, `/health/ready`, SIGTERM limpio, JWT/issuer/audience/kid/scope, header spoofing, SQL parametrizado y Problem Details sin stack/hosts/payloads.

## 11. Rendimiento

Dataset reproducible con propietarios, huéspedes, habitaciones y reservas históricas/activas. Registrar seed, hardware, concurrencia y warmup. Detalle e historial deben demostrar p95 < 500 ms y errores inesperados < 1 %.

## 12. Evidencia diferida

No cerrar integración total hasta probar:

- Gateway ↔ Bookings;
- Bookings ↔ Accommodations quote real;
- Bookings ↔ Payments y eventos reales;
- eventos hacia Notifications/Reviews;
- flujo completo en Compose.



## 13. Evidencia real PostgreSQL — T078/T100

Fecha: 2026-11-06. Entorno: PostgreSQL 16.15 local efímero en `127.0.0.1:55433`, base `bookings_test`.

```powershell
$env:BOOKINGS_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55433/bookings_test?schema=public"
npm run prisma:bookings:migrate:deploy
# Applied migration 001_bookings_core
# Applied migration 002_booking_lifecycle_fields

$env:BOOKINGS_TEST_DATABASE_URL = $env:BOOKINGS_DATABASE_URL
npm run test:bookings:integration   # 7 suites, 26 tests passed
npm run test:bookings:concurrency   # 1 suite, 2 tests passed
npm run test:e2e --workspace @stayhub/bookings-service   # 1 suite, 2 tests passed
npm run test:performance --workspace @stayhub/bookings-service  # 1 suite, 2 tests passed
npm run test:bookings               # 35 suites, 184 tests passed
```

- `owner-history.spec.ts`, `guest-cancellation.spec.ts` y `stay-lifecycle.spec.ts` pasaron contra PostgreSQL real.
- Concurrencia GiST: exactamente una reserva superpuesta gana; intervalos contiguos permitidos.
- E2E aislado: create → payment.confirmed → check-in → check-out → eligibility y create → cancel → refund → refund-completed.
- Rendimiento: p95 historial 110 ms y detalle 45 ms, por debajo de 500 ms.

## 14. Cobertura — T101

```powershell
npm run test:coverage --workspace @stayhub/bookings-service
# All files: statements 74.32 %, branches 76.79 %, functions 75.82 %, lines 79.92 %
```

Cumple el umbral global de 70 % con las integraciones PostgreSQL activas.

## 15. Contratos, Compose y CI

- `node scripts/validate-bookings-contracts.mjs`: OpenAPI válido, operaciones requeridas y JSON Schema válido.
- `openapi-drift.spec.ts` sin drift generado↔fuente.
- Compose y CI validados estáticamente (YAML parseable); contenedor no-root, read-only, `restart: always`, healthchecks y grace period.
- Los escenarios reales se ejecutaron con contenedores temporales gestionados por los harnesses; sus recursos se eliminaron al terminar.

## 16. Evidencia de integraciones externas

### Evidencia T097 — Gateway ↔ Bookings real (2026-11-11)

`npm run test:gateway:bookings:e2e` levantó Gateway y Bookings NestJS reales, PostgreSQL 16 y
Redis 7 temporales. Los 4/4 escenarios aprobaron autenticación/roles, creación, detalle,
historial, check-in/out, JWT delegado, trazas y Problem Details. La política aprobada se verificó
por usuario: las primeras 10 escrituras y 60 lecturas dentro de 60 segundos se aceptan; la
escritura 11 y lectura 61 responden `429 BOOKINGS_RATE_LIMITED` con `Retry-After`.

### Evidencia T095 — Bookings → Accommodations quote real (2026-11-11)

Se ejecutaron las suites de Accommodations contra PostgreSQL 16 real: contract 48/48,
security 66/66 e integration 55/55. Después, `npm run test:unir:e2e` levantó el
`accommodations-service` real, aplicó sus migraciones y sembró propiedades/habitaciones de fixture.
Bookings consultó `GET /internal/v1/properties/{propertyId}/rooms/{roomId}/booking-quote` con JWT
RS256 de scope `accommodations:booking-quote`; no se utilizó el stub HTTP anterior.

### Evidencia T096a — Bookings → Payments REST real (2026-11-10)

Se levantó un proyecto Compose aislado con Payments, PostgreSQL 16 y RabbitMQ, se aplicaron las dos migraciones de Payments y se ejecutó `test/e2e/bookings-payments.e2e-spec.ts` con JWT RS256 de scopes `payments:charge` y `payments:refund`.

- cobro aprobado y replay con el mismo `paymentId`, sin segundo cargo;
- cobro rechazado con estado autoritativo `DECLINED`;
- reembolso completado y replay con el mismo `refundId`, sin segundo reembolso;
- resultado: **3 suites de escenario / 3 PASS**.

La prueba usa `BOOKINGS_PAYMENTS_E2E_URL`, `BOOKINGS_PAYMENTS_E2E_CHARGE_TOKEN` y `BOOKINGS_PAYMENTS_E2E_REFUND_TOKEN`; si faltan, se omite explícitamente.

### Evidencia T096b — flujo distribuido real (actualizada 2026-11-11)

Se ejecutó `npm run test:unir:e2e`, un harness aislado con PostgreSQL 16, RabbitMQ, Payments, Bookings, Notifications, outbox relays, consumidores, workers y HTTP reales. El harness genera sus propias claves/tokens RS256, aplica migraciones, levanta únicamente sus contenedores y los elimina al terminar.

Escenarios verificados:

- reserva creada y cobrada; Payments publica `payment.v1.approved`; Bookings confirma; el worker invoca Notifications; se crea una sola `BOOKING_CONFIRMATION` y un solo `CHECKIN_REMINDER`;
- replay con el mismo `eventId` no duplica transición, outbox, trabajo, confirmación ni recordatorio;
- pago rechazado termina en `PAYMENT_FAILED` sin notificación y un aprobado tardío no reactiva el estado terminal;
- caída temporal de Notifications deja `NotificationWork` recuperable y readiness reporta `degraded` sin deshabilitar la confirmación de pagos;
- reinicio de Notifications y de los workers de Bookings procesa el trabajo pendiente;
- reinicio del consumidor de Bookings no pierde un evento aprobado pendiente en RabbitMQ;
- Bookings ↔ Reviews valida elegibilidad real, creación después de estadía completada y rechazo de duplicados/no completadas;
- refund completado conserva `CANCELLED_BY_GUEST` y la disponibilidad liberada permite una reserva solapada.

Resultado final: **8 escenarios / 8 PASS**, con cleanup de procesos y contenedores en exit code 0.

Resultado: **7 escenarios PASS**. El harness no usa mocks de PostgreSQL, RabbitMQ ni HTTP para el flujo principal.

### Evidencia T098 — Bookings ↔ Reviews real (2026-11-10)

`npm run test:unir:e2e` levanta también Reviews y ejecuta `apps/bookings-service/test/e2e/bookings-reviews.e2e-spec.ts` contra Bookings y Reviews reales con PostgreSQL y JWT RS256:

- reserva creada y cobrada, check-in y check-out por el OWNER;
- Reviews consulta elegibilidad REST y crea una reseña `GUEST` para la estadía `COMPLETED`;
- la respuesta no expone `bookingId` ni `guestId`;
- reintento de la misma reserva devuelve `409`;
- reserva no completada devuelve `404` sin divulgación.

Resultado: **8/8 escenarios del harness PASS** (7 de Payments/Notifications + 1 de Reviews). El handoff `REVIEWS-HANDOFF.md` se mantiene congelado.
