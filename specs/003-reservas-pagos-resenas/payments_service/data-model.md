# Data Model: Payments Service de StayHub

**Base de datos**: `payments_db` (PostgreSQL 16, propiedad exclusiva de `payments-service`)  
**ORM**: Prisma 6.19.0. Las restricciones críticas se declaran también en SQL de migración (`CHECK`, índices parciales), no solo en el esquema Prisma.

## Reglas globales

- Identificadores `uuid` generados por la aplicación (UUID v4). Fechas `timestamptz` en UTC.
- Dinero: `amount_minor` y `refunded_amount_minor` como `BIGINT` en SQL / `BigInt` en Prisma; `amountMinor` como entero JSON **seguro** en rango 1..9 000 000 000 000. COP y USD = 2 decimales ISO 4217 (100 unidades menores = 1 unidad mayor). Las conversiones Prisma BigInt → number solo después de validar rango; prohibido `float`, truncar o redondear.
- No se almacena PAN, CVV, vencimiento ni el token en claro. Solo `payment_method_fingerprint` (HMAC-SHA-256 del token con secreto del servicio).
- Ninguna tabla referencia tablas de otro servicio. `booking_id` y `payer_user_id` son identificadores opacos (sin FK).

## Entidad `payments`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `booking_id` | uuid NOT NULL | Identificador de Bookings (sin FK). |
| `payer_user_id` | uuid NOT NULL | Pagador. Se usa para autorizar la consulta. |
| `amount_minor` | bigint NOT NULL | `CHECK (amount_minor BETWEEN 1 AND 9000000000000)` y límite configurable menor o igual validado en dominio. |
| `currency` | char(3) NOT NULL | Lista permitida por configuración. |
| `status` | enum NOT NULL | `PENDING`, `REVIEW_REQUIRED`, `APPROVED`, `DECLINED`, `FAILED`, `PARTIALLY_REFUNDED`, `REFUNDED`. `REVIEW_REQUIRED` **no** es terminal y bloquea otro cobro. |
| `refunded_amount_minor` | bigint NOT NULL DEFAULT 0 | `CHECK (refunded_amount_minor >= 0 AND refunded_amount_minor <= amount_minor)`. |
| `failure_code` | text NULL | Código estable (ver abajo). Nunca el mensaje crudo de la pasarela. |
| `payment_method_type` | text NOT NULL | Solo `CARD_TOKEN` en este incremento. |
| `payment_method_fingerprint` | text NOT NULL | HMAC del token. |
| `gateway_reference` | text NULL | Referencia de la transacción en la pasarela. No se expone por API. |
| `reconcile_attempts` | integer NOT NULL DEFAULT 0 | Para el reconciliador. |
| `next_reconcile_at` | timestamptz NULL | Solo con `PENDING`; NULL al escalar a revisión. |
| `version` | integer NOT NULL DEFAULT 1 | Bloqueo optimista. |
| `created_at`, `updated_at`, `approved_at` | timestamptz | `approved_at` NULL hasta aprobar. |

**Índices**

- `UNIQUE (booking_id) WHERE status IN ('PENDING','REVIEW_REQUIRED','APPROVED','PARTIALLY_REFUNDED')` — garantiza un pago activo por reserva (PAY-FR-006).
- `(payer_user_id, created_at DESC)` — consultas por pagador.
- `(status, next_reconcile_at) WHERE status = 'PENDING'` — barrido del reconciliador.

**Códigos de resultado/razón (`failure_code`)**: `INSUFFICIENT_FUNDS`, `CARD_DECLINED`, `SUSPECTED_FRAUD`, `GATEWAY_UNAVAILABLE` (fallo pre-dispatch confirmado), `GATEWAY_TIMEOUT` (informativo mientras está PENDING), `RECONCILIATION_EXHAUSTED` (**revisión**, nunca prueba de fallo financiero). Prohibidos mensajes crudos de pasarela.

### Máquina de estados de `Payment`

```
PENDING ──resultado confirmado──▶ APPROVED ──reembolso parcial──▶ PARTIALLY_REFUNDED ──restante──▶ REFUNDED
   │                                 └────────────────reembolso total───────────────────▶ REFUNDED
   ├──rechazo confirmado──▶ DECLINED   (terminal)
   ├──fallo pre-dispatch con prueba──▶ FAILED   (terminal)
   └──consulta agotada sin evidencia──▶ REVIEW_REQUIRED ──evidencia──▶ APPROVED | DECLINED | FAILED
```

Transiciones válidas: `PENDING→APPROVED|DECLINED|FAILED|REVIEW_REQUIRED`, `REVIEW_REQUIRED→APPROVED|DECLINED|FAILED` **solo con evidencia autoritativa y auditoría**, `APPROVED→PARTIALLY_REFUNDED|REFUNDED`, `PARTIALLY_REFUNDED→PARTIALLY_REFUNDED|REFUNDED`. `FAILED` exige evidencia de no cobro, no mero agotamiento del reconciliador. Otra transición: `STATE_CONFLICT`. Estados terminales: `DECLINED`, `FAILED`, `REFUNDED`. La revisión manual no ofrece endpoint público en este incremento.

## Entidad `refunds`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `payment_id` | uuid NOT NULL FK → `payments.id` | |
| `amount_minor` | bigint NOT NULL | `CHECK (amount_minor > 0 AND amount_minor <= 9000000000000)`. |
| `currency` | char(3) NOT NULL | Igual a la del pago (D-11). |
| `reason` | enum NOT NULL | `GUEST_CANCELLATION`, `OWNER_CANCELLATION`. |
| `status` | enum NOT NULL | `PENDING`, `REVIEW_REQUIRED`, `COMPLETED`, `FAILED`. Un `FAILED` representa fallo definitivo acreditado. |
| `failure_code` | text NULL | |
| `gateway_reference` | text NULL | |
| `created_at`, `updated_at` | timestamptz | |

**Índices**: `(payment_id, created_at)`; `UNIQUE (payment_id) WHERE status IN ('PENDING','REVIEW_REQUIRED')` — impide dos reembolsos en vuelo sobre el mismo pago.

**Saldo reembolsable** = `payments.amount_minor − payments.refunded_amount_minor`. Solo los reembolsos `COMPLETED` aumentan `refunded_amount_minor`, dentro de la misma transacción con el cambio de estado del pago y bloqueo de fila (`SELECT … FOR UPDATE`).

**Máquina de estados de Refund**: `PENDING→COMPLETED|FAILED|REVIEW_REQUIRED`; `REVIEW_REQUIRED→COMPLETED|FAILED` únicamente con evidencia autoritativa y auditoría. Durante `PENDING` y `REVIEW_REQUIRED` otro reembolso devuelve `409` y no se ejecuta. Mantener los locks de filas **solo en la transacción local**, nunca durante una llamada a la pasarela.

## Entidad `refund_status_history`

Auditoría inmutable (**solo INSERT**) para cada cambio de estado de reembolso. Campos: `id`, `refund_id` (FK), `from_status`, `to_status`, `reason_code`, `actor` (`bookings-service`, `reconciler`, `system`), `evidence_ref_hash` (HMAC de referencia documental **solo cuando exista evidencia**, no referencia cruda), `occurred_at`. Se escribe en la misma transacción que `refunds`/`payments`/outbox; el evento del relay, sujeto a retención, **no sustituye** este historial persistente.

## Entidad `idempotency_records`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `scope` | text NOT NULL | `charge` o `refund:<paymentId>`. |
| `key` | uuid NOT NULL | Valor de `Idempotency-Key`. |
| `request_fingerprint` | char(64) NOT NULL | SHA-256 del cuerpo canónico. |
| `caller_subject` | text NOT NULL | `sub` del JWT de servicio. |
| `response_status` | integer NULL | NULL mientras la operación está en vuelo. |
| `response_body` | jsonb NULL | Respuesta reproducible. Nunca incluye token. |
| `resource_id` | uuid NULL | Pago o reembolso resultante. |
| `expires_at` | timestamptz NOT NULL | Retención `PAYMENTS_IDEMPOTENCY_TTL_HOURS` (por defecto 48). |

**Índice único**: `(scope, key, caller_subject)`. Una respuesta `503` **solo si está demostrado que no se envió operación** no se almacena: se libera la clave para reintentar. Con cualquier duda de despacho, la clave y el recurso quedan asociados al estado `PENDING`/`REVIEW_REQUIRED`; el TTL no borra registros que aún protegen recursos ambiguos. La huella usa cuerpo canónico + tipo de operación + identidad del llamador; jamás se registra el cuerpo/token claro. El replay reproduce respuesta original (p. ej. 202) y el GET muestra el estado más reciente.

## Entidad `outbox_events`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | Es el `eventId` del contrato. |
| `aggregate_id` | uuid NOT NULL | `paymentId`. Define el orden de publicación. |
| `event_type` | text NOT NULL | `payment.v1.approved`, `payment.v1.declined`, `payment.v1.failed`, `payment.v1.refunded`, `payment.v1.refund_failed`, `payment.v1.review_required`, `payment.v1.refund_review_required` (incluye `refundId`, `refundAmountMinor` incierto y `reasonCode`). |
| `payload` | jsonb NOT NULL | Cumple `contracts/payment-events-v1.schema.json`. |
| `status` | enum NOT NULL | `PENDING`, `PUBLISHED`, `DEAD`. |
| `attempts` | integer NOT NULL DEFAULT 0 | |
| `next_attempt_at` | timestamptz NOT NULL | Backoff exponencial con tope. |
| `created_at`, `published_at` | timestamptz | |

**Índice**: `(status, next_attempt_at) WHERE status = 'PENDING'`. El relay toma lotes con `FOR UPDATE SKIP LOCKED`.

## Entidad `mock_gateway_operations` (solo desarrollo/pruebas)

Simula de forma **durable** el registro de un proveedor externo. **No** se reutiliza como autoridad para el saldo de `payments` ni se integra en sus transacciones. Una escritura del adaptador ocurre como operación independiente, después del pre-registro PENDING; sobrevive reinicios. Permite probar el fallo *proveedor ya cobró → Payments cayó antes del commit*. En una pasarela real, el ledger sería **externo**.

| Campo | Tipo | Reglas |
|---|---|---|
| `operation_ref_hash` | char(64) PK | HMAC-SHA256 de referencia opaca de operación; no contiene token ni Idempotency-Key en claro. |
| `kind` | enum | `CHARGE` o `REFUND`. |
| `result` | enum | `APPROVED`, `DECLINED`, `REFUND_COMPLETED`, `REFUND_FAILED`, `UNKNOWN` (sin evidencia). |
| `failure_code` | text NULL | Solo códigos estables; no datos del método de pago. |
| `refund_fixture_result` | enum NULL | Solo CHARGE: `NORMAL` o `REFUND_DECLINED` (para fixture `tok_refund_fails`); no almacenar ni reconstruir token. |
| `created_at`, `resolved_at` | timestamptz | Para pruebas de crash y consulta tras reinicio. |

`UNIQUE(kind, operation_ref_hash)`; un reintento con la misma referencia devuelve el resultado ya asentado, nunca genera una segunda operación. `tok_gateway_timeout` **registra resultado aprobatorio en el ledger y luego simula perder la respuesta**, de modo que un reinicio permita recuperarlo. Otros resultados futuros se fijan mediante fixtures explícitos; ninguna operación UNKNOWN se supone FALLIDA por el paso del tiempo.

## Entidad `payment_status_history`

Inmutable (solo `INSERT`). Campos: `id`, `payment_id` (FK), `from_status`, `to_status`, `reason_code`, `actor` (`bookings-service`, `reconciler`, `system`), `evidence_ref_hash` (solo para resolución con evidencia, nunca la referencia cruda), `occurred_at`. Se escribe en la misma transacción que cada cambio de estado.

## Datos sensibles y retención

| Dato | Tratamiento |
|---|---|
| Token de pago | Solo se usa en memoria para llamar a la pasarela; se persiste únicamente su HMAC. |
| `payer_user_id`, `booking_id` | Identificadores opacos. No se registran correos ni nombres. |
| `idempotency_records` | Se purgan al expirar solo si el recurso asociado está definitivamente resuelto y la política de reintentos y deduplicación lo permite. Nunca purgar claves que protegen `PENDING`/`REVIEW_REQUIRED`. |
| `outbox_events` `PUBLISHED` | Se purgan tras `PAYMENTS_OUTBOX_RETENTION_DAYS` (por defecto 7). `DEAD` no se purga automáticamente. |
| `mock_gateway_operations` | Solo dev/test, sin token ni PAN; no se purga antes de las pruebas de recuperación y retención documentada. |
