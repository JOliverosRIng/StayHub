# Data Model: Fundamentos e identidad

## Ownership boundaries

| Service/database | Authoritative data | Explicitly not owned |
|---|---|---|
| `users-service` / `users_db` | User identity, normalized email, role, profile, photo, profile version, registration state | Password hash, sessions, refresh tokens |
| `auth-service` / `auth_db` | Credential, registration orchestration, sessions, refresh tokens | Email, name, phone, preferences, photo |

`userId` is a stable UUID generated once for registration and copied into Auth as an external
reference. There is no cross-database foreign key and neither service may query the other DB.

## Users database

### User

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key; immutable |
| `name` | varchar(100) | Required; trim; 2–100 characters |
| `email` | varchar(254) | Required; display/login value after outer trim |
| `emailNormalized` | varchar(254) | Required; `trim().toLowerCase()`; unique index |
| `role` | enum | `GUEST`, `OWNER`, `ADMIN`; immutable from profile |
| `status` | enum | `PENDING`, `ACTIVE`, `CANCELLED` |
| `phone` | varchar(16), nullable | E.164 (`+` and up to 15 digits) |
| `preferences` | jsonb, nullable | Object; at most 20 properties; scalar values only |
| `version` | integer | Starts at 1; increments on every profile mutation |
| `registrationId` | UUID | Unique idempotent link to registration saga |
| `createdAt` | timestamptz | Server assigned |
| `updatedAt` | timestamptz | Server assigned |

Constraints:

- Unique index on `emailNormalized` is the final concurrency authority.
- Public creation accepts only `GUEST` and `OWNER`. `ADMIN` may exist only via the authorized
  internal process outside this feature.
- Queries for login/profile exclude any status other than `ACTIVE`.
- Update predicate includes `id` and `version`; zero affected rows means version conflict.
- `null` is forbidden for name/email and clears phone/preferences.

### ProfilePhoto

| Field | Type | Rules |
|---|---|---|
| `userId` | UUID | PK and FK to User within `users_db`; one-to-zero/one |
| `content` | bytea | Required; maximum 5 MiB |
| `mediaType` | enum | `image/jpeg` or `image/png` after magic-byte inspection |
| `byteSize` | integer | 1..5,242,880 |
| `sha256` | char(64) | Digest for ETag/integrity, not client filename |
| `updatedAt` | timestamptz | Server assigned |

The original filename is discarded. Normal profile reads return photo metadata/link only; the
binary is loaded exclusively by the photo endpoint. Profile and photo changes occur in the same
Users transaction.

## Auth database

### Credential

| Field | Type | Rules |
|---|---|---|
| `userId` | UUID | Primary key; external reference, no FK |
| `passwordHash` | text | Argon2id encoded hash; never returned/logged |
| `status` | enum | `PENDING`, `ACTIVE`, `REVOKED` |
| `createdAt` | timestamptz | Server assigned |
| `updatedAt` | timestamptz | Server assigned |

Auth never persists email. Password input is required with 8–128 characters as the security
baseline for this increment and is erased from request-scoped objects after verification/hash.

### Registration

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key; value from `Idempotency-Key` |
| `requestFingerprint` | char(64) | HMAC/canonical hash; never contains raw password |
| `userId` | UUID | Stable identifier shared across saga steps |
| `state` | enum | See state machine below |
| `attemptCount` | integer | Retry/reconciliation counter |
| `lastErrorCode` | varchar, nullable | Safe internal code; no secrets |
| `expiresAt` | timestamptz | Pending cleanup deadline |
| `createdAt` / `updatedAt` | timestamptz | Server assigned |

States:

```text
STARTED
  → USER_PENDING
  → CREDENTIAL_PENDING
  → CREDENTIAL_ACTIVE
  → COMPLETED

Any non-completed state → COMPENSATING → CANCELLED
Transient failures retain current state for idempotent retry/reconciliation.
```

The credential status and Users status are checked during reconciliation. `COMPLETED` means
both are ACTIVE. Same idempotency key with a different fingerprint is a conflict.

### Session

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key; JWT `sid` |
| `userId` | UUID | External reference; indexed |
| `role` | enum | `GUEST`, `OWNER`, `ADMIN`; copied from the ACTIVE User at login and immutable for this session |
| `createdAt` | timestamptz | Login time |
| `absoluteExpiresAt` | timestamptz | Exactly `createdAt + 7 days`; never extended |
| `revokedAt` | timestamptz, nullable | Set on replay/manual invalidation |
| `revokeReason` | enum, nullable | `REFRESH_REUSE`, `EXPIRED`, `SECURITY`, `USER_INACTIVE` |
| `version` | integer | Concurrency control for rotation/revocation |

An active session has no `revokedAt` and current time precedes `absoluteExpiresAt`. Redis may
cache active/revoked status no longer than the remaining access-token lifetime; PostgreSQL
remains authoritative.

### RefreshToken

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key/internal JTI |
| `sessionId` | UUID | FK to Session within `auth_db`; indexed |
| `tokenHash` | char(64) | Unique HMAC/SHA-256 of opaque token; never raw token |
| `status` | enum | `ACTIVE`, `CONSUMED`, `REVOKED` |
| `issuedAt` | timestamptz | Server assigned |
| `expiresAt` | timestamptz | Equal to Session absolute expiry |
| `consumedAt` | timestamptz, nullable | Set atomically on rotation |
| `replacedByTokenId` | UUID, nullable | Self-reference to successor |

Rotation transaction:

1. Lock session and matching token.
2. Reject invalid/revoked/expired state.
3. If token is `CONSUMED`, revoke Session and all active descendants.
4. Otherwise mark it `CONSUMED`, insert one replacement and update link.
5. Commit before returning the new raw token/JWT.

## JWT projection

Access JWT is not persisted as a domain entity. It projects:

| Claim | Source |
|---|---|
| `sub` | User id returned by Users |
| `sid` | Session id |
| `role` | Immutable Session role captured from the ACTIVE User at login |
| `jti` | New access-token UUID |
| `iss` | Configured StayHub auth issuer |
| `aud` | StayHub API audience |
| `iat`, `exp` | Auth clock; `exp = iat + 3600s` |
| header `kid`, `alg` | Active signing key, `RS256` |

Email and profile fields are deliberately absent.

## Aggregate invariants

- Only ACTIVE User + ACTIVE Credential may create a Session.
- A PENDING User/Credential is never visible or authenticable; reconciliation must converge to
  both ACTIVE or cancel/expire the incomplete registration.
- Session role equals the Users role resolved at login and does not change during that session;
  any future role-management flow must revoke affected sessions before applying a new role.
- Every active RefreshToken belongs to one non-revoked Session; a Session has at most one
  active refresh token after a committed rotation.
- Refresh expiry never exceeds Session absolute expiry.
- Reuse of any consumed token revokes the whole Session.
- Email equivalence is enforced by stored normalized value and database uniqueness.
- A profile update either advances all requested fields/photo and version, or changes nothing.
- Role, user id, registration state and credential data are never profile-editable.

## Mapping to requirements

| Requirement area | Model enforcement |
|---|---|
| FR-001–006 | User role/status/email unique + Registration/Credential states/idempotency |
| FR-007–013 | Credential, Session, RefreshToken and JWT projection |
| FR-014–023 | User/ProfilePhoto/version constraints and transactional update |
| FR-024 | Secrets isolated in Auth and excluded from projections/contracts |
