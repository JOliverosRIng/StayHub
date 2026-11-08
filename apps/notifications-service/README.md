# Notifications service

NestJS microservice for sending and reading StayHub notifications. It listens on port `3009` and exposes only:

- `POST /notifications/send` — access JWT with `ADMIN`, or service JWT with the configured send scope; requires `Idempotency-Key`.
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

The database URL may also be supplied through `NOTIFICATIONS_DATABASE_URL_FILE`. `_FILE` values are read at startup; direct values are used when the matching file variable is absent. Startup errors and JSON logs never include key contents, tokens or database credentials.

## Migration and startup

The `start` and `start:dev` scripts load `.env` using Node's `--env-file` option. Create the local database before applying the schema:

```powershell
npm run prisma:migrate:dev
npm run start:dev
```

In a deployed environment, apply checked-in migrations with `npm run prisma:migrate:deploy` and run `npm start`. Swagger UI is enabled only when `NODE_ENV=development`, at `/docs`; it is not an application endpoint in the production route set.

## Delivery behavior and limits

`IN_APP` notifications are stored locally. `EMAIL` uses `FakeEmailAdapter`: it opens no sockets and sends no email. The default local adapter returns an accepted result; unit tests exercise its finite `DELIVERY_UNAVAILABLE` outcome. There is no external email provider, automatic retry, queue, scheduler or cross-service lookup. The service stores `userId` and `bookingId` as references and creates no foreign keys to other services.

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

The repository's isolated integration tests use deterministic adapters unless a test explicitly requires PostgreSQL. Compose and Gateway wiring are platform work outside this service's scope.
