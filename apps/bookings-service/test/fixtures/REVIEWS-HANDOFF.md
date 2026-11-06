# Handoff Bookings → Reviews (RQ-11 parcial)

Bookings es la autoridad de la elegibilidad. Reviews no accede a `bookings_db` ni importa código interno.

## 1. Evento `booking.v1.completed`

Producido por Bookings dentro de la misma transacción del check-out. Payload mínimo autoritativo:

```json
{
  "eventId": "00000000-0000-4000-8000-000000000041",
  "eventType": "booking.v1.completed",
  "schemaVersion": 1,
  "occurredAt": "2035-06-03T12:00:00.000Z",
  "bookingId": "00000000-0000-4000-8000-000000000042",
  "guestId": "00000000-0000-4000-8000-000000000043",
  "propertyId": "00000000-0000-4000-8000-000000000044"
}
```

Contrato fuente: `specs/003-reservas-pagos-resenas/booking_service/contracts/booking-payment-events-v1.schema.json` (`bookingCompleted`).

## 2. Endpoint interno de elegibilidad

`GET /internal/v1/bookings/{bookingId}/review-eligibility?guestId={guestId}`

- Requiere service JWT con scope `reviews:eligibility` y audience configurada (`BOOKINGS_REVIEWS_JWT_SCOPE`, `BOOKINGS_REVIEWS_JWT_AUDIENCE`).
- Responde `200` solo si la reserva está `COMPLETED` y `guestId` coincide con el snapshot.
- Reserva inexistente, ajena o no completada responde `404` sin divulgación.

Respuesta positiva:

```json
{
  "bookingId": "00000000-0000-4000-8000-000000000042",
  "guestId": "00000000-0000-4000-8000-000000000043",
  "propertyId": "00000000-0000-4000-8000-000000000044",
  "eligible": true
}
```

## 3. Fixture estable

`apps/bookings-service/test/fixtures/reviews-handoff.fixture.ts` expone `bookingCompletedEvent()` y `reviewEligibilityResponse()` para que el equipo Reviews construya su consumer/provider test sin cambios internos en Bookings.

Cualquier cambio incompatible exige revisión conjunta y nueva versión de esquema.
