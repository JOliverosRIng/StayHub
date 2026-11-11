# Data Model: bookings-service

## Principios

- `bookings_db` pertenece exclusivamente a Bookings.
- UUID de huésped, propietario, propiedad, habitación y pago son referencias externas sin FK.
- Disponibilidad se deriva de reservas que bloquean; Search no es autoridad.
- Fechas son días calendario con intervalo `[checkIn, checkOut)`.
- Datos comerciales de Accommodations se copian como snapshot inmutable.
- Dinero usa `numeric(12,2)` y string decimal en contratos.

## Booking

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | PK generada por Bookings. |
| `guestId` | UUID | `sub` del GUEST; índice. |
| `ownerId` | UUID | Snapshot de Accommodations; índice para RQ-08/RQ-10. |
| `propertyId` | UUID | Referencia externa. |
| `roomId` | UUID | Referencia externa; participa en exclusión. |
| `propertyName` | varchar(120) | Snapshot para historia. |
| `roomName` | varchar(120) | Snapshot para historia. |
| `checkIn` | date | Inclusivo. |
| `checkOut` | date | Exclusivo y mayor. |
| `stayPeriod` | daterange | Derivado `[checkIn,checkOut)` para constraint. |
| `guests` | integer | 1..capacidad snapshot. |
| `capacitySnapshot` | integer | Positivo. |
| `nightlyPriceAmount` | numeric(12,2) | Positivo. |
| `currency` | char(3) | ISO 4217. |
| `nights` | integer | `checkOut-checkIn`, positivo. |
| `totalAmount` | numeric(12,2) | Precio × noches; check coherente. |
| `accommodationVersion` | integer | Versión Property cotizada. |
| `roomSourceUpdatedAt` | timestamptz | Versión temporal de la habitación. |
| `status` | enum | Estado de reserva. |
| `paymentStatus` | enum | Resumen financiero no autoritativo; incluye `REVIEW_REQUIRED`, `REFUND_REVIEW_REQUIRED` y `REFUND_FAILED` para incertidumbre/fallos explícitos. |
| `paymentOrderId` | UUID nullable | Referencia externa única cuando existe. |
| `holdExpiresAt` | timestamptz nullable | Obligatorio en `PENDING_PAYMENT`. |
| `cancellationPolicyVersion` | varchar nullable | Política evaluada. |
| `cancelledBy` | enum nullable | `GUEST|OWNER|SYSTEM`. |
| `cancellationReason` | varchar(500) nullable | Obligatoria para OWNER. |
| `cancelledAt` | timestamptz nullable | Auditoría. |
| `checkedInAt`, `checkedOutAt` | timestamptz nullable | Ciclo básico. |
| `version` | integer | Optimistic locking de comandos no concurrentes. |
| `createdAt`, `updatedAt` | timestamptz | Servidor. |

### Estados

`PENDING_PAYMENT`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `PAYMENT_FAILED`, `EXPIRED`, `CANCELLED_BY_GUEST`, `CANCELLED_BY_OWNER`.

Bloquean disponibilidad: `PENDING_PAYMENT`, `CONFIRMED`, `CHECKED_IN`.

### Restricciones e índices

- CHECK fechas, huéspedes, capacidad, montos, noches y moneda.
- GiST exclusion: `roomId WITH =`, `stayPeriod WITH &&` condicionado a estados bloqueantes.
- Índices `(guestId, createdAt DESC, id)`, `(ownerId, createdAt DESC, id)`, `(ownerId,status,checkIn,id)`, `(propertyId,checkIn,id)`, `paymentOrderId` único parcial y `holdExpiresAt` para pendientes.
- No se borra físicamente una reserva en el flujo normal.

## BookingTransition

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | PK. |
| `bookingId` | UUID FK local | Cascade restringido por retención. |
| `fromStatus`, `toStatus` | enum nullable/enum | Primera transición permite `fromStatus=null`. |
| `actorType` | enum | `GUEST|OWNER|SERVICE|SYSTEM`. |
| `actorId` | UUID nullable | No se usa para secretos. |
| `reasonCode` | varchar(80) | Código estable. |
| `metadata` | jsonb | Solo datos seguros y acotados. |
| `occurredAt` | timestamptz | Servidor. |

Índice `(bookingId, occurredAt, id)`.

## IdempotencyRecord

| Campo | Tipo | Regla |
|---|---|---|
| `guestId` | UUID | Parte de PK lógica. |
| `key` | varchar(128) | Parte de PK; formato acotado. |
| `requestHash` | char(64) | SHA-256 del comando canónico. |
| `bookingId` | UUID FK local nullable | Se asigna en la misma transacción. |
| `state` | enum | `IN_PROGRESS|COMPLETED|FAILED_RETRYABLE`. |
| `responseStatus` | integer nullable | Resultado replayable. |
| `createdAt`, `expiresAt` | timestamptz | Retención explícita. |

Reutilización con hash distinto produce conflicto. La limpieza nunca borra una clave aún en proceso.

## PaymentWork

Representa trabajo de integración recuperable, no la transacción financiera.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | PK. |
| `bookingId` | UUID FK local | Una operación activa por tipo. |
| `operation` | enum | `CREATE_ORDER|REQUEST_REFUND`. |
| `idempotencyKey` | varchar | Única por operación. |
| `amount`, `currency` | numeric/char | Snapshot del comando. |
| `status` | enum | `PENDING|IN_FLIGHT|SUCCEEDED|FAILED_RETRYABLE|DEAD`. |
| `attempts`, `nextAttemptAt` | integer/timestamptz | Backoff limitado. |
| `lastErrorCode` | varchar nullable | Seguro, sin payload remoto. |

## NotificationWork

Trabajo durable Bookings→Notifications creado atómicamente al confirmar el pago.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | PK. |
| `bookingId` | UUID FK local | Único por `(bookingId, operation)`. |
| `operation` | enum | `BOOKING_CONFIRMED`. |
| `status` | enum | `PENDING|IN_FLIGHT|SUCCEEDED|FAILED_RETRYABLE|DEAD`. |
| `attempts`, `nextAttemptAt` | integer/timestamptz | Backoff limitado y recuperación de lease. |
| `lastErrorCode` | varchar nullable | Código seguro; nunca JWT, correo ni cuerpo. |
| `createdAt`, `updatedAt` | timestamptz | Auditoría y detección de trabajo abandonado. |

El claim usa `FOR UPDATE SKIP LOCKED`; una fila `IN_FLIGHT` vencida se reclama de nuevo. La entrega HTTP se ejecuta fuera de la transacción de confirmación y Notifications deduplica por `bookingId`.

## OutboxEvent

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | `eventId`. |
| `aggregateId` | UUID | `bookingId`. |
| `eventType` | varchar(120) | Nombre versionado. |
| `schemaVersion` | integer | Inicial 1. |
| `payload` | jsonb | Contrato documentado, sin secretos. |
| `occurredAt` | timestamptz | Hora del hecho. |
| `publishedAt` | timestamptz nullable | Confirmación broker. |
| `attempts`, `nextAttemptAt` | integer/timestamptz | Reintentos. |

Índice parcial sobre no publicados.

## ProcessedEvent

| Campo | Tipo | Regla |
|---|---|---|
| `eventId` | UUID | PK idempotente. |
| `eventType` | varchar(120) | Tipo conocido. |
| `payloadHash` | char(64) | Detecta reutilización conflictiva. |
| `processedAt` | timestamptz | Commit local. |
| `outcome` | varchar | Resultado seguro. |

## CancellationDecision

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | PK. |
| `bookingId` | UUID FK local | Reserva evaluada. |
| `policyVersion` | varchar | Obligatorio. |
| `actorType` | enum | GUEST u OWNER. |
| `eligible` | boolean | Resultado. |
| `refundMode` | enum | `NONE|POLICY|FULL`. |
| `evaluatedAt` | timestamptz | Auditoría. |

No se persisten porcentajes hasta que producto defina una política; el resultado exacto proviene del puerto versionado.

## Transiciones permitidas

| Desde | Comando/evento | Hacia |
|---|---|---|
| — | create | PENDING_PAYMENT |
| PENDING_PAYMENT | payment.confirmed | CONFIRMED |
| PENDING_PAYMENT | payment.failed | PAYMENT_FAILED |
| PENDING_PAYMENT | hold.expired | EXPIRED |
| PENDING_PAYMENT/CONFIRMED | cancel guest | CANCELLED_BY_GUEST |
| PENDING_PAYMENT/CONFIRMED | cancel owner | CANCELLED_BY_OWNER |
| CONFIRMED | check-in | CHECKED_IN |
| CHECKED_IN | check-out | COMPLETED |

Eventos repetidos son no-op idempotente si el hash coincide. Transiciones distintas de las listadas producen `409 STATE_CONFLICT` o se marcan ignoradas si son eventos tardíos ya resueltos.

