# Notifications service

NestJS service skeleton for the internal notifications API. It listens on port `3009` and validates its local configuration at startup. NTF-002 adds no HTTP routes; the contract remains limited to `POST /notifications/send` and `GET /notifications/user/{id}` for later tasks.

## Local configuration

Copy `.env.example` to a local environment file and replace each `REPLACE_*` value with test/development values. Do not use production secrets in development. Database URLs and public keys may be supplied with a matching `_FILE` variable; key files must contain public RSA keys of at least 2048 bits. Private keys are rejected.

Required settings:

- `NOTIFICATIONS_PORT=3009`.
- `NOTIFICATIONS_DATABASE_URL` points to PostgreSQL database `notifications_db`.
- Access JWT issuer, audience, key id and public key use the `NOTIFICATIONS_JWT_*` variables.
- Service JWT issuer, audience, key id, public key and send scope use `NOTIFICATIONS_SERVICE_JWT_*` and `NOTIFICATIONS_SEND_SCOPE`. The example uses the dedicated scope `notifications:send`; the token issuer must provision the same scope. This service does not issue tokens.

The verifier configuration caps access JWT age at 3600 seconds and service JWT age at 300 seconds, matching the Users service conventions. The service loads public keys only and does not call Auth, Gateway or any other service during startup. This task validates the database URL but does not open a database connection; persistence is introduced later.

## Commands

From this directory:

```powershell
npm ci
npm run start:dev
npm test -- --runInBand
npm run lint
npm run typecheck
```

Tests and local startup use synthetic values. No external delivery provider or other StayHub service is required for this configuration foundation.
