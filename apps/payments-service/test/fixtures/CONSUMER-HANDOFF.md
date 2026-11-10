# Payments consumer handoff

This contract is for `bookings-service` and `notifications-service`. Payments is
the authority for payment and refund outcomes. Bookings owns reservation totals,
cancellation policy, and reservation state; Notifications owns delivery to users.
No consumer should infer payment success or failure from a request timeout.

## REST calls and scopes

Use a short lived RS256 service JWT with the configured issuer, audience, `kid`,
and a single exact scope. Send UUID `Idempotency-Key` values and reuse the same
key and body for retries of one logical operation.

| Caller | Operation | Required scope | Notes |
| --- | --- | --- | --- |
| Bookings | `POST /payments` | `payments:charge` | Send the amount already calculated by Bookings. |
| Bookings | `POST /payments/{paymentId}/refund` | `payments:refund` | Bookings decides whether cancellation qualifies and the refund amount. |
| Bookings or Notifications | `GET /payments/{paymentId}/status` | `payments:read` | Use for reconciliation or a missing/delayed event. |

Example charge:

```http
POST /payments HTTP/1.1
Authorization: Bearer <short-lived-service-jwt>
Idempotency-Key: 020808e5-4f7f-42d2-967f-63a8db6ed400
Content-Type: application/json
```

```json
{
  "bookingId": "794e39f7-7903-4b32-a833-55edb2bfbd19",
  "payerUserId": "bfbaf9f6-66a0-4119-bc7b-f1604feb323a",
  "amountMinor": 35000000,
  "currency": "COP",
  "paymentMethod": { "type": "CARD_TOKEN", "token": "<opaque-provider-token>" }
}
```

`amountMinor` is an integer in hundredths (for example, COP 350,000.00 is
`35000000`). Only `COP` and `USD` are currently configured by default. Never
send PAN, CVV, expiration date, or cardholder data.

Example refund:

```http
POST /payments/794e39f7-7903-4b32-a833-55edb2bfbd19/refund HTTP/1.1
Authorization: Bearer <short-lived-service-jwt>
Idempotency-Key: d76d9752-a9b1-4a58-93e3-87402a2f9ae3
Content-Type: application/json
```

```json
{ "reason": "GUEST_CANCELLATION", "amountMinor": 10000000 }
```

Omit `amountMinor` to refund the remaining full balance. For
`OWNER_CANCELLATION`, Payments requires the full remaining balance; Bookings
must apply its own policy before calling. The refund always uses the payment's
currency.

## Responses and retry behavior

- `201` is a definitive charge/refund result. A charge can be `APPROVED`,
  `DECLINED`, or definitively `FAILED`; a refund can be `COMPLETED` or
  definitively `FAILED`.
- `202` means the provider outcome is ambiguous and remains `PENDING`. Keep the
  reservation/payment workflow unresolved, retry with the same idempotency key,
  and consume later events or query the status endpoint. Do not create a new
  charge/refund key to get around a pending operation.
- `409` means a state or idempotency conflict. Re-read status before deciding
  what to do.
- `503` means the adapter can prove the operation was not dispatched. It is
  safe to retry with the same idempotency key and request body.
- `REVIEW_REQUIRED` means reconciliation exhausted its authoritative checks;
  it does **not** mean declined, failed, paid, or refunded. Preserve the booking
  hold and escalate for operator review.

## RabbitMQ events

Exchange: durable topic `stayhub.payments`. Routing keys:

`payment.approved`, `payment.declined`, `payment.failed`, `payment.refunded`,
`payment.refund_failed`, `payment.review_required`,
`payment.refund_review_required`.

Messages use the versioned envelope in
[`payment-events-v1.schema.json`](../../../../specs/003-reservas-pagos-resenas/payments_service/contracts/payment-events-v1.schema.json).
For example:

```json
{
  "eventId": "4082bfa8-50e9-492b-af5f-e2a2054dc51e",
  "eventType": "payment.v1.approved",
  "schemaVersion": 1,
  "occurredAt": "2026-11-08T14:35:00.000Z",
  "paymentId": "2dfb4e85-5c26-420a-9c64-89bd1d841580",
  "bookingId": "794e39f7-7903-4b32-a833-55edb2bfbd19",
  "payerUserId": "bfbaf9f6-66a0-4119-bc7b-f1604feb323a",
  "amountMinor": 35000000,
  "currency": "COP"
}
```

Refund events add `refundId`, `refundedAmountMinor`,
`totalRefundedAmountMinor`, `reason`, and `paymentStatus`. Decline/failure
events include `failureCode`. Review events include `reasonCode:
RECONCILIATION_EXHAUSTED`; refund review events also include `refundId` and
`refundAmountMinor`. Validate every event against the JSON Schema.

Delivery is **at least once**. Deduplicate by `eventId`, persist the deduplication
record with the consumer's state update, and acknowledge only after that commit.
Events are intended to preserve order per `paymentId`; consumers should still
compare resource state/version and tolerate redelivery or delay. Do not rely on
global ordering. On retry, keep the same event identity. A missing event is not
proof of a declined payment; query status with `payments:read` when needed.

The envelope intentionally contains no provider token, card data, idempotency
key, gateway reference, email, or other contact information. Consumers must not
add those values to derived events or logs.

## Ownership and integration boundary

This handoff documents the provider contract only. The real Bookings and
Notifications clients, broker credentials/queues, consumer acknowledgements,
retry/dead-letter policies, end-to-end user messages, and deployed integration
remain to be supplied and exercised by their respective owners. The current
Payments Compose smoke uses real PostgreSQL and deliberately omits RabbitMQ to
verify its degraded-ready behavior; the integration suite separately exercises
the relay against real RabbitMQ.
