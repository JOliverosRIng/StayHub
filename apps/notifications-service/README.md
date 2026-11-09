# Notifications service

## Docker with Payments

From the repository root, run `npm run dev:services:up`, then
`npm run test:services:smoke`. This builds both services, applies migrations,
and keeps a dedicated persistent PostgreSQL volume for each service.
Notifications is available on `http://localhost:3009`; `/health/live` checks the
process and `/health/ready` checks its notification and reminder tables.
See [Docker operations](../../infra/docker/SERVICES.md) for commands and limits.

NestJS microservice for sending and reading StayHub notifications. It listens on port `3009` and exposes:

- `POST /notifications/send` — access JWT with `ADMIN`, or service JWT with the configured send scope; requires `Idempotency-Key`.
- `POST /notifications/events/booking-confirmed` — service JWT event ingress; creates an in-app confirmation and schedules an in-app check-in reminder.
- `GET /notifications/user/{id}` — access JWT for the owner or an `ADMIN`; paginated with an opaque cursor.

## Local setup

Use Node 20 and a dedicated local PostgreSQL database named `notifications_db`. The service has no dependency on Users or another StayHub process. Do not point its URL at another service's database.

```powershell
cd apps/notifications-service
npm ci
Copy-Item .env.example .env
```

Edit `.env` and replace all `REPLACE_*` placeholders. Use synthetic local credentials and two public RSA keys of at least 2048 bits. Keep private keys outside this service; it only verifies tokens. The corresponding access and service JWT issuers must use the configured issuer, audience and `kid`; service tokens also need `NOTIFICATIONS_SEND_SCOPE` (example: `notifications:send`). Access tokens are limited to 3600 seconds and service tokens to 300 seconds. This process does not issue tokens or call Auth/Gateway.

The required settings are:

| Variable | Purpose |
| --- | --- |
| `NOTIFICATIONS_PORT` | Must be `3009`. |
| `NOTIFICATIONS_DATABASE_URL` | PostgreSQL URL whose database path is `/notifications_db`. |
| `NOTIFICATIONS_JWT_ISSUER`, `NOTIFICATIONS_JWT_AUDIENCE`, `NOTIFICATIONS_JWT_KID` | Access token validation. |
| `NOTIFICATIONS_JWT_PUBLIC_KEY` | Access token public RSA key, or `NOTIFICATIONS_JWT_PUBLIC_KEY_FILE`. |
| `NOTIFICATIONS_SERVICE_JWT_ISSUER`, `NOTIFICATIONS_SERVICE_JWT_AUDIENCE`, `NOTIFICATIONS_SERVICE_JWT_KID` | Service token validation. |
| `NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY` | Service token public RSA key, or `NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY_FILE`. |
| `NOTIFICATIONS_SEND_SCOPE` | Dedicated service token scope required for POST. |
| `NOTIFICATIONS_EMAIL_MODE` | `stub` (default) or `smtp` for real SMTP delivery. |
| `NOTIFICATIONS_SMTP_HOST`, `NOTIFICATIONS_SMTP_FROM` | Required when SMTP mode is enabled. |
| `NOTIFICATIONS_SMTP_PORT`, `NOTIFICATIONS_SMTP_SECURE` | SMTP port (default `587`) and implicit TLS flag (default `false`; STARTTLS is required otherwise). |
| `NOTIFICATIONS_SMTP_USER`, `NOTIFICATIONS_SMTP_PASSWORD` | Optional SMTP credentials; configure both or neither. Each supports a matching `_FILE` variable for mounted secrets. |

The database URL may also be supplied through `NOTIFICATIONS_DATABASE_URL_FILE`. `_FILE` values are read at startup; direct values are used when the matching file variable is absent. Startup errors and JSON logs never include key contents, tokens or database credentials.

## Migration and startup

The `start` and `start:dev` scripts load `.env` using Node's `--env-file` option. Stop any running service process before regenerating Prisma, then create the local database and apply the schema:

```powershell
npm run prisma:generate
npm run prisma:migrate:dev
npm run start:dev
```

Booking can notify this service after a reservation is confirmed by calling
`POST /notifications/events/booking-confirmed` with a service JWT and the booking fields documented
in OpenAPI. The event is idempotent by `bookingId`. The service records an `IN_APP`
`BOOKING_CONFIRMATION`, then stores an `IN_APP` `CHECKIN_REMINDER` for 24 hours before `checkInAt`.
If the reservation is confirmed within that 24-hour window, the reminder is due immediately. A
database-backed worker polls every 30 seconds and claims rows safely across multiple instances.
The booking producer is not wired by this repository change; it must call the event route.

Example event body (timestamps include the accommodation's UTC offset):

```json
{
  "userId": "6b2bf6ea-4d76-4f3e-84a7-5a7857825b66",
  "bookingId": "booking-123",
  "roomTitle": "Suite",
  "roomLocation": "Bogotá",
  "checkIn": "2026-12-01",
  "checkOut": "2026-12-03",
  "guests": 2,
  "totalPrice": 250000,
  "checkInAt": "2026-12-01T15:00:00-05:00"
}
```

In a deployed environment, apply checked-in migrations with `npm run prisma:migrate:deploy` and run `npm start`. Swagger UI is enabled only when `NODE_ENV=development`, at `/docs`; it is not an application endpoint in the production route set.

## Delivery behavior and limits

`IN_APP` notifications are stored locally. `EMAIL` uses the simulated adapter by default; it opens no sockets and does not send email. To enable real delivery, set `NOTIFICATIONS_EMAIL_MODE=smtp` and configure the SMTP variables above. SMTP delivery uses TLS, bounded connection timeouts, and stores only a safe failure code. System alerts are available through `POST /notifications/send` using the `SYSTEM_ALERT` type. The automatic check-in reminder remains an in-app notification; failed delivery is recorded as `FAILED` and is not automatically retried.

## Checks

Run from this directory:

```powershell
npm test -- --runInBand
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:security
npm run lint
npm run typecheck
npm run build
node scripts/validate-openapi.mjs
```

The repository's isolated integration tests use deterministic adapters unless a test explicitly requires PostgreSQL. The root smoke test verifies the Docker deployment against real PostgreSQL, including persistence after restarting both databases and services. Gateway wiring remains separate.
