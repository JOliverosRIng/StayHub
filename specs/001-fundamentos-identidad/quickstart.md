# Quickstart Validation Guide: Fundamentos e identidad

This guide defines how the completed implementation will be started and validated. It does not
contain implementation code. Model and contract details live in [data-model.md](./data-model.md)
and [contracts/](./contracts/).

## Prerequisites

- Docker Engine with Docker Compose v2.
- Node.js 20 and npm for local test/lint commands.
- `curl` capable of HTTPS and cookies; OpenSSL for a local development certificate.
- A copy of `.env.example` completed with local, non-production values.

Required secret inputs include independent DB passwords, an HMAC key for refresh-token hashes,
service-auth credentials and an RS256 signing keypair. Never commit generated `.env`, private
keys, cookies or tokens.

## Static checks

From the repository root after implementation:

```powershell
npm ci
npm run lint
npm run typecheck
npm test -- --coverage
docker compose config --quiet
```

Expected:

- All workspaces compile in strict TypeScript mode.
- Affected code reports at least 70% unit coverage.
- Compose resolves without missing variables or invalid dependencies.
- Contract lint and generated-vs-versioned OpenAPI comparison pass.

## Start the composed environment

Generate/install the documented local TLS certificate, then run:

```powershell
docker compose build
docker compose up -d
docker compose ps
```

Expected startup order:

1. `auth-db`, `users-db`, Redis, RabbitMQ, OpenTelemetry Collector and Loki become healthy.
2. `auth-migrate` and `users-migrate` finish successfully.
3. Auth, Users and Gateway readiness endpoints become healthy.
4. Web becomes available; Gateway serves HTTPS on `https://localhost:8443/api/v1`.

Internal ports 3001/3002 and databases must not be reachable outside Compose. RabbitMQ
management may be exposed only under the development profile.

## Automated validation

```powershell
npm run test:integration
npm run test:contract
npm run test:e2e
npm run test:performance
```

The suites must use PostgreSQL 16, not an in-memory substitute, for uniqueness, transaction,
lock and migration cases. E2E runs against the composed HTTPS gateway and React app.

## Manual API walkthrough

Set a shell variable for the gateway URL and use a cookie jar. Use unique UUIDs and emails for
each run; do not paste real credentials into logs or issue trackers.

### 1. Register

Call `POST /auth/register` with a UUID `Idempotency-Key`, valid `name` and `email`, a password of
8–128 characters supplied without trimming/case/Unicode transformation, and role `GUEST` or
`OWNER` as defined in
[the public contract](./contracts/openapi-public.yaml).

Verify:

- First result is `201` with no credential/token fields.
- Repeating the identical key and payload returns the same logical result and one account.
- Reusing the key with different data returns `409`.
- `ADMIN`, unknown fields or invalid data return `400` and no ACTIVE account.
- Concurrent equivalent emails (case/outer-space variants) produce one `201` and one `409`.
- Eleven requests from one trusted client origin inside a rolling 10-minute window cause the
  eleventh and subsequent requests to return generic `429` with an accurate `Retry-After`.

### 2. Login

Call `POST /auth/login` with the registered email/password and save cookies.

Verify:

- `200`, bearer access token, `expiresIn: 3600` and Secure HttpOnly refresh cookie.
- Wrong password and unknown email return indistinguishable `401` Problem Details.
- Old email stops working immediately after an email change; new email works.
- More than 30 attempts from one trusted client origin in 5 minutes, or the sixth failed attempt
  for one normalized identifier in 15 minutes, returns generic `429` with `Retry-After` without
  confirming account existence. A successful login clears only the identifier counter.

### 3. Validate protected access

Call `GET /auth/validate` with the bearer access token and then without it or with a modified
token.

Verify valid request is `200` with the role captured when the session was created; missing,
modified or expired token is `401`, and a token role differing from session introspection is
`401`. Refresh must preserve the same session role. Use a second account to call
`GET /users/{firstUserId}/profile`; it must return `403` and leave data untouched.

### 4. Update profile atomically

Read the own profile and note `version`. Send multipart PATCH with JSON part `profile`
containing `expectedVersion` and changed fields; attach a valid JPEG/PNG when required.

Verify:

- Valid name/email/E.164/preferences/photo changes return `200` and version increments once.
- Omitting a field preserves it; explicit null clears optional data.
- Unknown/restricted fields return `400` and preserve every prior field.
- Duplicate email or stale version returns `409` with no partial change.
- Non-JPEG/PNG is `415`; a photo over 5 MiB is `413`; both preserve current profile/photo.
- Photo GET returns the correct media type and binary bytes, never base64 in profile JSON.

### 5. Rotate and replay refresh token

Call `POST /auth/refresh` with the saved cookie, capture the rotated cookie, then replay the old
cookie from a saved copy.

Verify:

- First call returns `200`, a one-hour access token and a different refresh cookie.
- Replay returns generic `401`, revokes the whole session and clears the cookie.
- The access token issued by the successful refresh subsequently fails validation with `401`.
- Refresh after seven days from the original login is `401`; rotation never extends that time.
- Two concurrent refresh calls result in one rotation and replay detection/session revocation.

## Failure-mode checks

- Stop Redis: protected access falls back to Auth PostgreSQL and never fails open.
- Stop Users: login/register/profile return `503`; no partial ACTIVE user is exposed.
- Interrupt registration between saga steps: retrying the same idempotency key resumes or the
  reconciler cancels the pending state; no login succeeds while pending.
- Inspect application logs: the same `traceId` crosses gateway/services; no password, raw token,
  hash, email, photo bytes or unnecessary PII is present.
- Query centralized Loki logs by `traceId` and confirm the complete Gateway→Auth/Users path is
  available without secrets or raw personal data.

## Acceptance evidence

For SC-001 and SC-006, schedule one moderated study with 20 consenting adult participants from
the target audience who have no prior StayHub experience. Assign 10 to the guest flow and 10 to
the owner flow; give 10 an invalid registration and 10 an invalid profile update. Use the same
browser, device class, seed data, script and instructions, and give no help after timing starts.
Count every started attempt. Record only consent, script, aggregated results and de-identified
evidence: SC-001 requires at least 19/20 complete registrations plus first logins under 3 minutes;
SC-006 requires at least 18/20 correctly identified invalid fields without hints.

For SC-005, Playwright runs 20 valid profile updates and measures from submit until the visible
React confirmation; at least 19/20 must finish under 5 seconds.

For the API benchmark, seed 100 `ACTIVE` users with independent sessions/tokens, then execute the
pinned k6 image through `npm run test:performance` against Compose HTTPS without disabling TLS
validation. Warm up for 30 seconds, then run simultaneous constant-arrival scenarios for 2
minutes: 25 requests/s to own-profile GET and 25 requests/s to access validation, selecting users
uniformly. CI fails unless each operation has `p(95)<500 ms` and unexpected errors stay below 1%.
Record commit, runner/resources, date, k6 version/digest and the unaltered result summary.

## Swagger/OpenAPI checks

In development only, inspect the gateway public Swagger and internal Auth/Users documents.
Confirm routes, security schemes, multipart encoding, all documented errors and examples match
the YAML contracts. CI must fail on drift.

## Cleanup

```powershell
docker compose down
```

This preserves named data volumes for diagnosis. Remove volumes only through an explicit,
separately approved cleanup operation.
