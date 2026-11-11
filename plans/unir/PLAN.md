# Prompt para DeepSeek — unir Payments, Bookings y Notifications

Puedes copiar desde **PROMPT** hasta **FIN DEL PROMPT** y entregarlo directamente a DeepSeek.

---

## PROMPT

Trabaja como ingeniero backend senior dentro del repositorio StayHub.

### Objetivo

Completa la integración distribuida:

```text
Bookings ──REST──> Payments                 (ya implementada; preservar)
Payments ──RabbitMQ──> Bookings             (implementar y probar)
Bookings ──HTTP idempotente──> Notifications (implementar y probar)
```

La rama actual es `feat/bookings-payments-rest` y contiene cambios **sin commit** que ya alinean el REST de Bookings con Payments. No descartes, reviertas, sobrescribas ni reformatees cambios ajenos. Antes de editar ejecuta:

```bash
git branch --show-current
git status --short
git diff --check
```

No uses `git reset --hard`, `git checkout --`, `db push` ni comandos destructivos. No hagas push. No hagas commit salvo que el usuario lo solicite expresamente.

### Estado ya completado que debes conservar

- Bookings llama `POST /payments` con scope `payments:charge`.
- Bookings llama `POST /payments/{id}/refund` con scope `payments:refund`.
- Montos se traducen a `amountMinor`.
- Las claves antiguas de idempotencia se normalizan a UUID determinista.
- Existe contrato provider-consumer y E2E REST real:
  - pago aprobado + replay;
  - pago rechazado;
  - refund completado + replay.
- Archivos relevantes:
  - `apps/bookings-service/src/infrastructure/http/payments-orders.client.ts`
  - `apps/bookings-service/src/infrastructure/http/payments-refunds.client.ts`
  - `apps/bookings-service/src/infrastructure/http/payments-contract.ts`
  - `apps/bookings-service/test/contract/payments-provider.contract.spec.ts`
  - `apps/bookings-service/test/e2e/bookings-payments.e2e-spec.ts`
  - `specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-payments-consumer.yaml`
- `T096a` está completada. Debes completar `T096b` y la conexión con Notifications.

### Fuentes autoritativas

Lee antes de implementar:

1. `specs/003-reservas-pagos-resenas/payments_service/contracts/payment-events-v1.schema.json`
2. `specs/003-reservas-pagos-resenas/payments_service/contracts/openapi-payments-service.yaml`
3. `specs/003-reservas-pagos-resenas/booking_service/spec.md`
4. `specs/003-reservas-pagos-resenas/booking_service/plan.md`
5. `specs/003-reservas-pagos-resenas/booking_service/tasks.md`
6. `specs/003-notificaciones/spec.md`
7. `specs/003-notificaciones/contracts/openapi-notifications-service.yaml`
8. `apps/notifications-service/src/application/notifications/booking-confirmed.use-case.ts`

Cuando los documentos de Bookings contradigan el contrato real de Payments, manda el contrato real del productor Payments y actualiza los artefactos consumidores de Bookings.

---

## Parte A — Payments → Bookings por RabbitMQ

### Problema actual

Payments produce estos eventos reales:

- `payment.v1.approved`
- `payment.v1.declined`
- `payment.v1.failed`
- `payment.v1.refunded`
- `payment.v1.refund_failed`
- `payment.v1.review_required`
- `payment.v1.refund_review_required`

Los publica en el exchange topic durable `stayhub.payments` con routing keys:

- `payment.approved`
- `payment.declined`
- `payment.failed`
- `payment.refunded`
- `payment.refund_failed`
- `payment.review_required`
- `payment.refund_review_required`

Bookings todavía espera nombres incompatibles como `payment.v1.confirmed`, `payment.v1.refund-completed`, usa `paymentOrderId` en vez de `paymentId`, enlaza `payment.v1.*` y comparte incorrectamente el exchange de salida de Bookings con el exchange de entrada de Payments.

### Implementación requerida

1. Separa configuración de mensajería:
   - exchange de salida Bookings: `stayhub.bookings.v1`;
   - exchange de entrada Payments: `stayhub.payments`;
   - queue durable exclusiva de Bookings para Payments;
   - DLQ durable;
   - routing binding `payment.*` o bindings explícitos.

2. Actualiza `.env.example`, carga/validación de configuración y sus pruebas. No registres URLs, JWT, payloads completos ni secretos.

3. Reemplaza el contrato consumidor viejo por el esquema real del productor. No copies tipos manuales que puedan derivar silenciosamente: agrega pruebas AJV contra `payment-events-v1.schema.json`.

4. Actualiza:
   - `application/ports/payment-saga.port.ts`;
   - `interfaces/events/booking-payment-event.dto.ts`;
   - `infrastructure/messaging/rabbitmq-payment.consumer.ts`;
   - UoW de resultado de pago y refund;
   - pruebas contractuales, unitarias, integración y E2E.

5. Mapeo de negocio mínimo:
   - `payment.v1.approved`: `PENDING_PAYMENT → CONFIRMED`, `paymentStatus → CAPTURED`.
   - `payment.v1.declined`: `PENDING_PAYMENT → PAYMENT_FAILED`, `paymentStatus → FAILED`.
   - `payment.v1.failed`: solo fallo definitivo no despachado; mismo estado terminal anterior.
   - `payment.v1.refunded`: actualizar a `PARTIALLY_REFUNDED` o `REFUNDED` según `paymentStatus` del evento, sin reactivar inventario.
   - `payment.v1.refund_failed`: conservar estado de cancelación; registrar resultado financiero fallido de manera explícita y segura.
   - `payment.v1.review_required` y `payment.v1.refund_review_required`: **no** tratarlos como fallo definitivo, **no** liberar holds/saldo y **no** permitir duplicar dinero. Si el enum actual no representa incertidumbre, agrega estados claros mediante migración Prisma/SQL.

6. Mantén semántica at-least-once:
   - deduplicar por `eventId`;
   - mismo `eventId` + mismo hash = ACK idempotente;
   - mismo `eventId` + hash distinto = conflicto, no mutar;
   - ACK solo después del commit PostgreSQL;
   - retry limitado para fallos transitorios;
   - poison message a DLQ con metadata segura;
   - eventos tardíos nunca reactivan estados terminales.

7. No uses `nack(..., false, false)` para enviar todo fallo directamente a DLQ. Implementa presupuesto de reintentos verificable, por ejemplo con header controlado y republish seguro o topology de retry documentada.

8. Asegura lifecycle real. Actualmente no basta con registrar el consumer como provider: debe iniciarse al arrancar Nest y cerrarse limpiamente en shutdown. Haz lo mismo con workers necesarios, sin timers duplicados ni promesas flotantes.

9. Cuando se confirme la reserva, en la misma transacción de cambio de estado crea:
   - transición de Booking;
   - evento Outbox `booking.v1.confirmed` con todos los datos mínimos necesarios;
   - trabajo durable para Notifications descrito en la Parte B.

---

## Parte B — Bookings → Notifications por HTTP idempotente

### Decisión de arquitectura

No conectes Payments directamente con Notifications. Bookings es la autoridad que decide que la reserva quedó confirmada y debe solicitar la notificación.

Usa el endpoint interno existente:

```text
POST /notifications/events/booking-confirmed
Authorization: Bearer <service JWT RS256>
```

Notifications crea la confirmación `IN_APP` y programa el recordatorio de check-in. No agregues un consumidor RabbitMQ a Notifications en este corte.

### Incompatibilidad de contrato que debes resolver

Notifications exige hoy `roomTitle` y `roomLocation`, pero Bookings conserva snapshots reales `propertyName` y `roomName`; no conserva ubicación. Está prohibido inventar una ubicación o enviar `propertyName` fingiendo que es una dirección.

Como la ruta todavía no tenía productor integrado, alinea el contrato interno de Notifications para usar datos verdaderos:

- `propertyName`
- `roomName`
- `userId`
- `bookingId`
- `checkIn`
- `checkOut`
- `guests`
- `totalPrice`
- `checkInAt`

Actualiza DTO, caso de uso, plantilla, OpenAPI, spec, data-model y pruebas de Notifications. Si necesitas compatibilidad temporal, acepta el contrato anterior solo de forma explícita y testeada, pero la representación canónica nueva debe usar `propertyName`/`roomName`.

### Entrega confiable requerida

No hagas la llamada HTTP a Notifications dentro de la transacción que confirma la reserva.

Implementa un patrón durable en Bookings:

1. Agrega `NotificationWork` (o nombre equivalente) al Prisma schema y una migración SQL reproducible.
2. Créalo atómicamente al aplicar `payment.v1.approved`.
3. Campos mínimos:
   - id UUID;
   - bookingId único para `BOOKING_CONFIRMED`;
   - operación/tipo;
   - status `PENDING|IN_FLIGHT|SUCCEEDED|FAILED_RETRYABLE|DEAD`;
   - attempts;
   - nextAttemptAt;
   - lastErrorCode seguro;
   - createdAt/updatedAt.
4. No guardes JWT, correo, cuerpo renderizado ni secretos.
5. Worker con claim concurrente seguro (`FOR UPDATE SKIP LOCKED`), timeout, backoff limitado y recuperación después de reinicio.
6. Cliente HTTP detrás de un puerto de aplicación:
   - URL configurable de Notifications;
   - service JWT con audience/scope correctos (`notifications:send` según configuración real);
   - validación cerrada de la respuesta;
   - mapeo de 401/403/409/5xx sin filtrar detalles internos.
7. Idempotencia:
   - Notifications ya deduplica confirmación por `bookingId`;
   - reintentar el mismo trabajo no crea segunda confirmación ni segundo recordatorio;
   - conflicto de contenido debe ir a `DEAD`/alerta, no reintentarse infinitamente.
8. Lifecycle:
   - worker iniciado una vez por aplicación;
   - shutdown ordenado;
   - readiness debe distinguir Notifications degradado sin mentir sobre la capacidad de confirmar pagos.

`checkInAt` debe derivarse de la fecha almacenada sin cambiar el día. Si Bookings solo maneja fechas de estadía, usa de forma documentada `${checkIn}T00:00:00.000Z` hasta que exista zona horaria de la propiedad; no inventes una zona local.

---

## Migraciones y base de datos

- Toda modificación Prisma debe incluir migración SQL versionada.
- Nunca uses `prisma db push` como sustituto.
- No agregues FK entre bases de microservicios.
- IDs externos siguen siendo referencias opacas.
- Las restricciones únicas e índices deben hacer cumplir idempotencia y claims eficientes en PostgreSQL, no solo en memoria.
- Preserva datos existentes y prueba migración desde base limpia.

---

## Pruebas obligatorias

### Contrato

- Los mensajes reales de Payments validan contra el JSON Schema del productor.
- Bookings rechaza campos desconocidos, versiones no soportadas y payloads inválidos.
- El cliente Notifications coincide con su OpenAPI actualizado.
- Prueba de drift provider-consumer para Payments y Notifications.

### Integración PostgreSQL/RabbitMQ reales

- approved confirma Booking y crea exactamente un NotificationWork.
- replay del evento no duplica transición, outbox ni trabajo.
- declined/failed terminan correctamente.
- review_required conserva incertidumbre y bloqueo.
- refunded parcial/total actualiza resumen financiero sin reactivar inventario.
- evento duplicado con hash distinto no muta.
- ACK ocurre después de commit.
- retry y DLQ se prueban con RabbitMQ real.

### E2E real

Levanta entornos aislados y demuestra:

```text
crear/cobrar reserva
→ Payments publica payment.v1.approved
→ Bookings consume y confirma
→ worker Bookings llama Notifications
→ Notifications crea una sola BOOKING_CONFIRMATION
→ Notifications programa un solo CHECKIN_REMINDER
```

También demuestra:

- pago rechazado no genera notificación;
- replay de evento no duplica notificación;
- caída temporal de Notifications deja trabajo recuperable;
- recuperación procesa el trabajo pendiente;
- refund no reactiva disponibilidad;
- reinicio de consumidores/workers no pierde trabajo.

No declares PASS si la prueba usa mocks donde se exige PostgreSQL, RabbitMQ o HTTP real.

---

## Comandos mínimos de verificación

Ejecuta, como mínimo:

```bash
npm run typecheck:bookings
npm run lint:bookings
npm run build:bookings
npm run test:bookings:unit
npm run test:bookings:contract
npm run test:bookings:integration
npm run test:e2e --workspace @stayhub/bookings-service

npm --prefix apps/notifications-service run typecheck
npm --prefix apps/notifications-service run lint
npm --prefix apps/notifications-service run build
npm --prefix apps/notifications-service test -- --runInBand
```

Para escenarios reales usa un proyecto Docker/Compose aislado y elimina únicamente sus contenedores/volúmenes temporales al terminar. No toques otros contenedores del usuario. Nunca imprimas JWT, claves privadas, URLs con contraseña ni secretos.

Si una suite se omite por falta de `BOOKINGS_TEST_DATABASE_URL` u otra dependencia, repórtala como **SKIPPED**, no PASS.

---

## Documentación y trazabilidad

Al terminar actualiza:

- `specs/003-reservas-pagos-resenas/booking_service/tasks.md`
- `specs/003-reservas-pagos-resenas/booking_service/quickstart.md`
- `specs/003-reservas-pagos-resenas/booking_service/validation-report.md`
- `specs/003-notificaciones/spec.md`
- `specs/003-notificaciones/plan.md`
- `specs/003-notificaciones/tasks.md`
- `specs/003-notificaciones/quickstart.md`
- README y `.env.example` de ambos servicios.

No marques `T096b` ni la integración Notifications como completas hasta tener evidencia E2E real.

### Entrega final esperada

Reporta:

1. resumen de arquitectura implementada;
2. archivos cambiados;
3. migraciones creadas;
4. contratos finales y mappings de eventos;
5. comandos ejecutados con resultados PASS/FAIL/SKIPPED;
6. evidencia E2E;
7. riesgos o pendientes reales;
8. `git status --short` y `git diff --stat`;
9. confirmación explícita de que no hiciste push ni descartaste cambios previos.

No te detengas en un análisis superficial: implementa, prueba y documenta. Si encuentras una contradicción contractual, explica la decisión con evidencia de los contratos del productor y continúa con la alternativa más segura que no invente datos ni estados financieros.

## FIN DEL PROMPT

