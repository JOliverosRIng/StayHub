---

description: "Dependency-ordered implementation tasks for Fundamentos e identidad"
---

# Tasks: Fundamentos e identidad

**Input**: Design documents from `specs/001-fundamentos-identidad/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`,
`quickstart.md`, the StayHub constitution and `tendencias.md`.

**Tests**: Required by the user request, the specification and Constitution Principle VIII.
Within each user-story phase, write the listed tests first and demonstrate that they fail for
the missing behavior before implementing it.

**Organization**: Tasks are grouped by user story. `[P]` is used only where tasks touch
different files and have no dependency on another unfinished task in the same group.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel after prior non-parallel dependencies are complete.
- **[Story]**: Maps to US1–US4 in `spec.md`; setup/foundation/polish tasks have no story label.
- Every task names the primary file or directory it changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the greenfield monorepo and reproducible toolchain required by every story.

- [ ] T001 Initialize npm workspaces and root scripts for Node 20, NestJS 10, React 18, strict TypeScript, lint, format, build and test in `package.json`, `package-lock.json`, `nest-cli.json` and `tsconfig.base.json`
- [ ] T002 [P] Scaffold the NestJS API Gateway workspace with ports and empty layered directories in `apps/api-gateway/package.json`, `apps/api-gateway/src/main.ts` and `apps/api-gateway/src/{application,infrastructure,interfaces,modules}/`
- [ ] T003 [P] Scaffold the NestJS Auth workspace with port 3001 and empty layered directories in `apps/auth-service/package.json`, `apps/auth-service/src/main.ts` and `apps/auth-service/src/{domain,application,infrastructure,interfaces,modules}/`
- [ ] T004 [P] Scaffold the NestJS Users workspace with port 3002 and empty layered directories in `apps/users-service/package.json`, `apps/users-service/src/main.ts` and `apps/users-service/src/{domain,application,infrastructure,interfaces,modules}/`
- [ ] T005 [P] Scaffold the React 18 + Vite workspace and feature folders in `apps/web/package.json`, `apps/web/vite.config.ts` and `apps/web/src/{app,features,router,shared}/`
- [ ] T006 Configure shared ESLint, Prettier, Jest and TypeScript project references without weakening strict mode in `eslint.config.js`, `.prettierrc`, `jest.config.ts` and `tsconfig.base.json`
- [ ] T007 [P] Create versioned shared contract and error-code package boundaries without domain/ORM logic in `libs/contracts/package.json` and `libs/contracts/src/index.ts`
- [ ] T008 [P] Create the shared trace/logging package interface with PII redaction hooks in `libs/observability/package.json` and `libs/observability/src/index.ts`
- [ ] T009 [P] Create shared test builders and fixture package with synthetic-only data in `libs/testing/package.json` and `libs/testing/src/index.ts`
- [ ] T010 Document all configuration names without secrets, including two DB URLs, Redis, RabbitMQ, TLS, RS256, service JWT and OTLP settings in `.env.example`
- [ ] T011 [P] Document local certificate generation and secret mounting without committing keys in `infra/tls/README.md` and `.gitignore`
- [ ] T012 [P] Add OpenTelemetry Collector and Loki development configuration with retention and no PII labels in `infra/observability/otel-collector.yaml` and `infra/observability/loki.yaml`
- [ ] T013 Create non-root multi-stage Node 20 container builds for all deployables in `infra/docker/gateway/Dockerfile`, `infra/docker/auth/Dockerfile`, `infra/docker/users/Dockerfile` and `infra/docker/web/Dockerfile`
- [ ] T014 Define the initial Compose topology for web, gateway, Auth, Users, two PostgreSQL 16 instances, Redis 7, RabbitMQ 3-management, Collector and Loki in `docker-compose.yml`
- [ ] T015 Configure CI stages for locked install, lint, typecheck, unit coverage, integration, OpenAPI drift and container build in `.github/workflows/ci.yml`

**Checkpoint**: Workspaces build with placeholder applications and Compose resolves its
configuration without implementing product behavior.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared security, configuration, persistence, contracts, errors,
observability and test infrastructure before any story.

**Critical**: No user-story implementation starts until this phase is complete.

- [ ] T016 Verify before any user-story work that the decisions already recorded on 2026-09-26 are consistent across `specs/001-fundamentos-identidad/{spec.md,plan.md,research.md,data-model.md,quickstart.md,contracts/}`: ADMIN provisioning/role changes are external; PENDING is invisible/non-authenticable and reconciles to ACTIVE or CANCELLED; registration password is exact-input 8–128 characters; registration/login limits and Retry-After match the documented windows; Session.role is immutable and authoritative through introspection; and k6/usability/SC-005 protocols have fixed denominators and thresholds
- [ ] T017 [P] Add validated Auth configuration with startup failure for DB, Redis, Argon2, RS256, service-auth and session settings in `apps/auth-service/src/infrastructure/config/auth-config.ts`
- [ ] T018 [P] Add validated Users configuration with startup failure for DB, JWT public key, service-auth and upload limits in `apps/users-service/src/infrastructure/config/users-config.ts`
- [ ] T019 [P] Add validated Web runtime configuration for same-site HTTPS gateway access in `apps/web/src/shared/config/runtime-config.ts`
- [ ] T020 Define Problem Details, field-error, role and trace-context contracts/codes in `libs/contracts/src/{errors,identity,trace}.ts`
- [ ] T021 Implement validated Gateway configuration with startup failure for missing HTTPS, service URLs, issuer/audience, registration 10/origin/10-minute and login 30/origin/5-minute rate-limit inputs, trusted client-origin extraction and body-size inputs; configure `httpsOptions` with mounted certificates so the public API is HTTPS-only; and add global validation, unknown-field rejection, Problem Details mapping and trace propagation in `apps/api-gateway/src/{main.ts,infrastructure/config/gateway-config.ts,interfaces/http/validation.pipe.ts,interfaces/http/problem.filter.ts,interfaces/http/trace.interceptor.ts}`
- [ ] T022 [P] Implement Auth global validation, safe error mapping and secret/PII redaction in `apps/auth-service/src/interfaces/http/{validation.pipe,problem.filter}.ts` and `apps/auth-service/src/infrastructure/logging/auth-logger.ts`
- [ ] T023 [P] Implement Users global validation, safe error mapping and PII/photo redaction in `apps/users-service/src/interfaces/http/{validation.pipe,problem.filter}.ts` and `apps/users-service/src/infrastructure/logging/users-logger.ts`
- [ ] T024 Implement and test short-lived audience/scope-bound service JWT issuance for every authorized caller (Auth and Gateway) and matching guards for every `/internal` receiver (Users and Auth), rejecting wrong issuer/audience/scope and unsigned or expired tokens in `apps/auth-service/src/infrastructure/service-auth/`, `apps/auth-service/src/interfaces/http/guards/service-auth.guard.ts`, `apps/api-gateway/src/infrastructure/service-auth/`, `apps/users-service/src/interfaces/http/guards/service-auth.guard.ts` and `apps/{auth-service,api-gateway,users-service}/test/integration/service-auth.spec.ts`
- [ ] T025 Implement typed REST clients with correlation, timeout, circuit breaker and retry only for idempotent operations in `apps/auth-service/src/infrastructure/http/users.client.ts` and `apps/api-gateway/src/infrastructure/http/{auth.client,users.client}.ts`
- [ ] T026 [P] Configure the Auth Prisma 6 provider and migration commands without runtime `db push` in `apps/auth-service/src/infrastructure/persistence/prisma/` and `apps/auth-service/package.json`
- [ ] T027 [P] Configure the Users Prisma 6 provider and migration commands without runtime `db push` in `apps/users-service/src/infrastructure/persistence/prisma/` and `apps/users-service/package.json`
- [ ] T028 [P] Implement liveness/readiness endpoints for Gateway, Auth and Users in `apps/{api-gateway,auth-service,users-service}/src/modules/health/`
- [ ] T029 Bootstrap separate public/internal Swagger documents and security schemes in `apps/api-gateway/src/interfaces/openapi/`, `apps/auth-service/src/interfaces/openapi/` and `apps/users-service/src/interfaces/openapi/`
- [ ] T030 Create PostgreSQL 16, Redis, RabbitMQ and HTTP integration-test harnesses with isolated synthetic fixtures in `libs/testing/src/integration/` and `apps/*/test/integration/setup.ts`
- [ ] T031 Wire migration jobs, health-gated startup, isolated DB credentials/volumes, internal networks and explicit restart policies in `docker-compose.yml`
- [ ] T032 Instrument Gateway, Auth, Users and Web with shared `traceId` and OTLP export while retaining redacted JSON stdout fallback in `libs/observability/src/otel.ts` and `apps/*/src/infrastructure/observability/`

**Checkpoint**: Foundation is ready; services start securely, expose health/OpenAPI skeletons and
can run isolated integration tests, but no user story is implemented.

---

## Phase 3: User Story 1 — Registrar una cuenta con rol (Priority: P1) — RQ-02 MVP

**Goal**: A visitor registers one complete account with name, email, password and public role
`GUEST` or `OWNER`; duplicates, invalid roles, partial states and accidental retries are rejected
or reconciled coherently.

**Independent Test**: Through the Gateway, register a unique guest/owner and then authenticate
its existence through the internal ACTIVE state; invalid/duplicate/admin/concurrent/retried
requests create at most one ACTIVE account and expose no partial account.

### Tests for User Story 1 (write first)

- [ ] T033 [P] [US1] Write failing public contract tests for `POST /auth/register`, `Idempotency-Key`, exact-input 8–128-character passwords, 10 requests/origin/rolling 10 minutes with the eleventh returning 429 plus accurate `Retry-After`, 201/400/409/429/503 and secret-free responses against `specs/001-fundamentos-identidad/contracts/openapi-public.yaml` in `apps/api-gateway/test/contract/register.contract.spec.ts`
- [ ] T034 [P] [US1] Write failing Auth contract tests for registration orchestration and safe failure mapping against `openapi-auth-service.yaml` in `apps/auth-service/test/contract/registration.contract.spec.ts`
- [ ] T035 [P] [US1] Write failing Users contract tests for create/activate/cancel pending registrations against `openapi-users-service.yaml` in `apps/users-service/test/contract/registration.contract.spec.ts`
- [ ] T036 [P] [US1] Write failing unit tests for `trim().toLowerCase()` email equivalence, GUEST/OWNER acceptance, public ADMIN rejection, external ADMIN provisioning/role-change boundary and registration state transitions in `apps/users-service/test/unit/registration-policy.spec.ts`
- [ ] T037 [P] [US1] Write failing unit tests for request fingerprinting, idempotent replay, incompatible-key conflict, exact-input 8–128-character passwords, Argon2id and saga/reconciliation transitions in `apps/auth-service/test/unit/registration-use-cases.spec.ts`
- [ ] T038 [P] [US1] Write failing PostgreSQL integration tests for unique normalized email and two concurrent equivalent registrations in `apps/users-service/test/integration/registration-concurrency.spec.ts`
- [ ] T039 [P] [US1] Write failing Auth↔Users integration tests for timeout, crash after each saga step, retry and compensation, asserting that PENDING is never visible/authenticable and every incomplete registration converges to ACTIVE completion or CANCELLED/expired cleanup in `apps/auth-service/test/integration/registration-saga.spec.ts`
- [ ] T040 [P] [US1] Write failing React tests for required fields, role options, validation messages, retry with stable idempotency key and confirmation in `apps/web/test/unit/features/auth/register-form.spec.tsx`

### Models and persistence for User Story 1

- [ ] T041 [P] [US1] Define `User` in `apps/users-service/prisma/schema.prisma` with `id UUID primary key immutable`; `name varchar(100) required, trim, 2–100 characters`; `email varchar(254) required after outer trim`; `emailNormalized varchar(254) required, trim().toLowerCase(), unique`; `role GUEST|OWNER|ADMIN`; `status PENDING|ACTIVE|CANCELLED`; optional `phone varchar(16) E.164`; optional `preferences jsonb object, at most 20 properties, scalar values only`; `version integer starts at 1`; unique `registrationId UUID`; and server-assigned timestamps
- [ ] T042 [P] [US1] Define `Credential` and `Registration` in `apps/auth-service/prisma/schema.prisma`: Credential has `userId UUID primary key external reference`, Argon2id `passwordHash`, `PENDING|ACTIVE|REVOKED`, timestamps; Registration has `id UUID from Idempotency-Key`, `requestFingerprint char(64)`, stable `userId UUID`, durable state, attempt count, safe nullable error code, expiry and timestamps
- [ ] T043 [P] [US1] Create the Users initial migration with unique `emailNormalized`/`registrationId` constraints and no cross-database FK in `apps/users-service/prisma/migrations/*_create_users/migration.sql`
- [ ] T044 [P] [US1] Create the Auth credential/registration migration and indexes without storing email or raw secrets in `apps/auth-service/prisma/migrations/*_create_credentials_registrations/migration.sql`

### Services, endpoints and UI for User Story 1

- [ ] T045 [US1] Implement Users domain values/policies for email, role, status, public GUEST/OWNER-only creation, external ADMIN provisioning/role-change boundary and registration invariants in `apps/users-service/src/domain/users/`
- [ ] T046 [US1] Implement idempotent create/activate/cancel pending-user repositories and use cases using local transactions in `apps/users-service/src/application/registration/` and `apps/users-service/src/infrastructure/persistence/prisma/user.repository.ts`
- [ ] T047 [US1] Expose service-authenticated internal registration controllers/DTOs with whitelist validation in `apps/users-service/src/interfaces/http/internal/registration.controller.ts`
- [ ] T048 [US1] Implement exact-input 8–128-character password validation plus Argon2id credential hashing/repository while erasing plaintext request references and never logging secrets in `apps/auth-service/src/application/credentials/` and `apps/auth-service/src/infrastructure/security/argon2-password-hasher.ts`
- [ ] T049 [US1] Implement the durable registration orchestrator, stable UUIDs, request fingerprint, retry policy, activation order and reconciler/compensation in `apps/auth-service/src/application/registration/`
- [ ] T050 [US1] Expose the Auth internal registration endpoint and map invalid role/data to 400, email/idempotency conflict to 409 and dependency failure to 503 in `apps/auth-service/src/interfaces/http/registration.controller.ts`
- [ ] T051 [US1] Implement Gateway `POST /api/v1/auth/register`, body limits and a rolling Redis limit of 10 requests per trusted client origin per 10 minutes, counting every request and returning deterministic 429 with seconds-to-oldest-expiry `Retry-After` from the eleventh, with fail-closed 503, trace propagation and response mapping in `apps/api-gateway/src/modules/auth/register.route.ts`
- [ ] T052 [US1] Implement the React registration page, typed client and stable per-submission idempotency key in `apps/web/src/features/auth/register/{RegisterPage.tsx,RegisterForm.tsx,register.api.ts}`
- [ ] T053 [US1] Generate/compare registration Swagger with the three versioned contracts and close any drift in `apps/{api-gateway,auth-service,users-service}/src/interfaces/openapi/` and `specs/001-fundamentos-identidad/contracts/`
- [ ] T054 [US1] Run and make green all US1 unit, integration and contract suites while recording RQ-02/FR-001–FR-006 coverage, the approved ADMIN scope and FR-005 observable-atomicity evidence in `apps/*/test/` and `specs/001-fundamentos-identidad/quickstart.md`

**Checkpoint**: RQ-02 registration is independently demonstrable through the Gateway.

---

## Phase 4: User Story 2 — Iniciar y renovar una sesión (Priority: P1)

**Goal**: A registered user logs in, receives a one-hour access token, renews within the
seven-day absolute session limit, and accesses protected routes with correct 401/403 behavior.

**Independent Test**: With a prepared ACTIVE account, demonstrate generic invalid-login errors,
valid JWT access, refresh rotation, absolute expiry, replay revocation and protected-route role
evaluation without requiring profile editing.

**Dependency**: Requires US1 ACTIVE User/Credential records and internal email resolution.

### Tests for User Story 2 (write first)

- [ ] T055 [P] [US2] Write failing public contract tests for login, refresh, validate, bearer/cookie security, login limits of 30 attempts/origin/5 minutes and 5 failures/HMAC(normalized email)/15 minutes, deterministic 429/Retry-After, success clearing only the identifier counter and 200/400/401/429/503 responses in `apps/api-gateway/test/contract/session.contract.spec.ts`
- [ ] T056 [P] [US2] Write failing Auth contract tests for login, token-pair rotation and session introspection in `apps/auth-service/test/contract/session.contract.spec.ts`
- [ ] T057 [P] [US2] Write failing unit tests for generic credential failure, minimal RS256 claims, issuer/audience/expiry, immutable Session.role copied from the ACTIVE login identity and preserved across refresh/introspection, claim/session-role mismatch rejection, seven-day absolute limit, rotation and replay revocation in `apps/auth-service/test/unit/session-use-cases.spec.ts`
- [ ] T058 [P] [US2] Write failing PostgreSQL integration tests for transactional refresh locking, one ACTIVE refresh per session and concurrent refresh causing family revocation in `apps/auth-service/test/integration/refresh-rotation.spec.ts`
- [ ] T059 [P] [US2] Write failing Auth↔Users integration tests for current-email resolution, inactive users, unavailable Users and non-enumerating 401 vs 503 responses in `apps/auth-service/test/integration/login.spec.ts`
- [ ] T060 [P] [US2] Write failing Gateway tests for missing/manipulated/expired JWT 401, valid-but-disallowed role 403 and failed introspection 503 in `apps/api-gateway/test/integration/auth-guards.spec.ts`
- [ ] T061 [P] [US2] Write failing Web tests for memory-only access token, HttpOnly cookie flow, single refresh in flight, one retry on 401 and no refresh on 403 in `apps/web/test/unit/shared/session/session-manager.spec.ts`

### Models and persistence for User Story 2

- [ ] T062 [US2] Define `Session` and `RefreshToken` in `apps/auth-service/prisma/schema.prisma`: Session has `id UUID`, indexed external `userId`, immutable `role GUEST|OWNER|ADMIN` captured at login, login `createdAt`, immutable `absoluteExpiresAt = createdAt + 7 days`, nullable `revokedAt`, reason `REFRESH_REUSE|EXPIRED|SECURITY|USER_INACTIVE`, version; RefreshToken has UUID id, session FK, unique `tokenHash char(64)`, `ACTIVE|CONSUMED|REVOKED`, issued/absolute expiry, nullable consumed time and successor id
- [ ] T063 [US2] Create Auth session/refresh migrations, indexes and constraints ensuring no token expiry exceeds its session and only transactionally selected active successors in `apps/auth-service/prisma/migrations/*_create_sessions_refresh_tokens/migration.sql`

### Services, endpoints and UI for User Story 2

- [ ] T064 [US2] Implement Users ACTIVE identity resolution by normalized email returning only `userId`, role and status in `apps/users-service/src/application/login/resolve-login-identity.use-case.ts` and `apps/users-service/src/interfaces/http/internal/login-identity.controller.ts`
- [ ] T065 [US2] Implement Auth login with normalized lookup, equivalent-cost unknown-user path, Argon2id verification, Redis failure counting at 5 failures per HMAC(normalized email) per rolling 15 minutes for existing/unknown accounts, success clearing only that counter, fail-closed 503 and generic 401/429 in `apps/auth-service/src/application/login/login.use-case.ts`
- [ ] T066 [US2] Implement RS256 key selection/rotation by `kid`, minimal claims `sub,sid,role,jti,iss,aud,iat,exp` and one-hour access expiry in `apps/auth-service/src/infrastructure/security/jwt-access-token.service.ts`
- [ ] T067 [US2] Implement opaque high-entropy refresh issuance, HMAC/hash storage, locked rotation, absolute expiry, JWT renewal from immutable Session.role and family revocation on consumed-token reuse in `apps/auth-service/src/application/sessions/refresh-session.use-case.ts`
- [ ] T068 [US2] Implement session introspection returning authoritative `active:true` plus immutable Session.role with PostgreSQL authority, Redis cache invalidation/fallback and fail-closed behavior in `apps/auth-service/src/application/sessions/validate-session.use-case.ts` and `apps/auth-service/src/infrastructure/cache/session-cache.ts`
- [ ] T069 [US2] Expose Auth internal login, refresh and session-validation controllers, including the documented introspection role, with no raw token logging in `apps/auth-service/src/interfaces/http/{login,refresh,session-validation}.controller.ts`
- [ ] T070 [US2] Implement Gateway Passport JWT strategy, global auth guard, public-route metadata, role guard and Auth introspection, rejecting claim/session-role mismatch and authorizing only with the introspected Session.role in `apps/api-gateway/src/modules/auth/`
- [ ] T071 [US2] Implement Gateway login/refresh/validate routes, Secure HttpOnly SameSite=Strict refresh cookie, cookie clearing and generic errors in `apps/api-gateway/src/modules/auth/session.routes.ts`
- [ ] T072 [US2] Implement Web login page, in-memory session store, Axios/TanStack Query interceptor and protected router shell in `apps/web/src/features/auth/login/` and `apps/web/src/shared/session/`
- [ ] T073 [US2] Generate/compare login, refresh and validate Swagger with versioned contracts in `apps/{api-gateway,auth-service,users-service}/src/interfaces/openapi/` and `specs/001-fundamentos-identidad/contracts/`
- [ ] T074 [US2] Run and make green all US2 unit, integration and contract suites while recording FR-007–FR-013 coverage in `apps/*/test/` and `specs/001-fundamentos-identidad/quickstart.md`

**Checkpoint**: Login, renewal and protected access are independently demonstrable without
profile mutations.

---

## Phase 5: User Story 3 — Consultar y editar el perfil propio (Priority: P2) — RQ-01

**Goal**: An authenticated user reads and atomically updates allowed profile fields, including
photo and email, with validation, optional-field deletion, optimistic concurrency and immediate
login-email change.

**Independent Test**: Authenticate one account, read its version, update each allowed field and
photo, reject invalid/duplicate/stale/unknown inputs without partial change, then log in only
with the new email.

**Dependency**: Requires US2 authentication/session behavior.

### Tests for User Story 3 (write first)

- [ ] T075 [P] [US3] Write failing public and Users contract tests for GET/PATCH/photo profile operations, including missing/invalid JWT 401, authenticated cross-user 403, client-supplied identity/service-header stripping, multipart JSON+photo, binary photo GET and 200/400/401/403/409/413/415 responses in `apps/api-gateway/test/contract/profile.contract.spec.ts` and `apps/users-service/test/contract/profile.contract.spec.ts`
- [ ] T076 [P] [US3] Write failing unit tests for name/email/E.164/preferences/null/unknown-field rules and optimistic version policy in `apps/users-service/test/unit/profile-validation.spec.ts`
- [ ] T077 [P] [US3] Write failing PostgreSQL integration tests for atomic multi-field updates, normalized email conflict, stale version and rollback in `apps/users-service/test/integration/profile-update.spec.ts`
- [ ] T078 [P] [US3] Write failing photo integration tests for JPEG/PNG magic bytes, 5 MiB boundary, transaction rollback, digest/ETag and binary serving in `apps/users-service/test/integration/profile-photo.spec.ts`
- [ ] T079 [P] [US3] Write failing React tests for loading existing values/version, omitted vs null fields, file selection, field errors, conflict refresh and confirmation in `apps/web/test/unit/features/profile/profile-form.spec.tsx`

### Models and persistence for User Story 3

- [ ] T080 [US3] Define `ProfilePhoto` in `apps/users-service/prisma/schema.prisma` with `userId UUID PK/FK 1:0..1`, required `content BYTEA` maximum 5,242,880 bytes, `mediaType image/jpeg|image/png` from magic bytes, `byteSize 1..5,242,880`, `sha256 char(64)` and server-assigned `updatedAt`, without original filename
- [ ] T081 [US3] Create the profile-photo table, byte-size constraints and supporting profile-version indexes in `apps/users-service/prisma/migrations/*_add_profile_photo/migration.sql`

### Services, endpoints and UI for User Story 3

- [ ] T082 [US3] Implement profile value objects/validators for `name 2–100 after trim`, `email valid max 254`, optional E.164 phone, at most 20 scalar preferences, omitted-preserve and allowed null-clears in `apps/users-service/src/domain/profiles/`
- [ ] T083 [US3] Implement magic-byte JPEG/PNG validation, 5 MiB limit, SHA-256 metadata and safe binary streaming in `apps/users-service/src/domain/photos/` and `apps/users-service/src/infrastructure/files/profile-photo.service.ts`
- [ ] T084 [US3] Implement transactional profile/photo repository update with `id+expectedVersion`, increment-on-success, unique normalized email and all-or-nothing rollback in `apps/users-service/src/infrastructure/persistence/prisma/profile.repository.ts`
- [ ] T085 [US3] Implement read/update profile application use cases and map duplicate/stale conflicts to distinct 409 codes in `apps/users-service/src/application/profiles/`
- [ ] T086 [US3] Implement Users Passport JWT verification with fixed RS256/issuer/audience, canonical principal extraction and ownership guard comparing JWT `sub` with route `userId`, then expose protected GET/PATCH/photo controllers with multipart parsing and DTO whitelist in `apps/users-service/src/interfaces/http/auth/jwt.strategy.ts`, `apps/users-service/src/interfaces/http/guards/profile-ownership.guard.ts` and `apps/users-service/src/interfaces/http/profiles/profile.controller.ts`
- [ ] T087 [US3] Strip every client-supplied identity/service header, propagate only validated bearer/trace context, and implement Gateway profile/photo routes with 5 MiB edge limit, streaming and safe status/header propagation in `apps/api-gateway/src/interfaces/http/security/identity-header.interceptor.ts` and `apps/api-gateway/src/modules/users/profile.routes.ts`
- [ ] T088 [US3] Implement typed Web profile API and query/mutation hooks including multipart construction and version handling in `apps/web/src/features/profile/profile.api.ts`
- [ ] T089 [US3] Implement the Web profile page/form/photo controls and accessible validation/confirmation states in `apps/web/src/features/profile/{ProfilePage.tsx,ProfileForm.tsx}`
- [ ] T090 [US3] Generate/compare profile Swagger including nullable semantics, multipart encoding and error responses in `apps/{api-gateway,users-service}/src/interfaces/openapi/` and `specs/001-fundamentos-identidad/contracts/`
- [ ] T091 [US3] Run and make green all US3 unit, integration and contract suites, including JWT, ownership and identity-header security, while recording RQ-01/FR-014–FR-021/FR-023 coverage in `apps/*/test/` and `specs/001-fundamentos-identidad/quickstart.md`

**Checkpoint**: RQ-01 valid/invalid profile editing is independently demonstrable for the
authenticated owner.

---

## Phase 6: User Story 4 — Restringir modificaciones no autorizadas (Priority: P2)

**Goal**: Enforce that every role can mutate only its own permitted profile fields; absent or
invalid authentication is 401, valid identity without ownership/permission is 403, and
restricted-field attempts are atomic 400 failures.

**Independent Test**: With two accounts and an administrator fixture, attempt cross-user access,
role/identity mutation, missing/invalid JWT and valid self-edit; only the self-edit succeeds and
all rejected targets remain unchanged.

**Dependency**: Requires US2 guards and US3 profile endpoints.

### Tests for User Story 4 (write first)

- [ ] T092 [P] [US4] Write failing tests that call Users Service directly with unsigned/`alg:none`, HS256-public-key-confusion, wrong-key RS256, wrong issuer/audience, expired tokens and missing/non-string/non-canonical-UUID `sub` or `sid`, asserting 401 before authorization and zero repository calls in `apps/users-service/test/security/jwt-hardening.spec.ts`
- [ ] T093 [P] [US4] Write failing unit tests for mismatched principal/target identity, ADMIN without cross-user privilege, role metadata granting no implicit permission and authentication precedence over authorization in `apps/users-service/test/unit/profile-authorization.spec.ts`
- [ ] T094 [P] [US4] Write failing direct-Users integration tests for GET/PATCH/photo where existing and nonexistent foreign IDs produce the same 403 before target lookup, disclose no existence difference and perform no target read/mutation in `apps/users-service/test/integration/profile-ownership.spec.ts`
- [ ] T095 [P] [US4] Write failing mass-assignment tests for role, user id, status, version override, credential and unknown fields causing whole-request 400 in `apps/users-service/test/integration/profile-restricted-fields.spec.ts`
- [ ] T096 [P] [US4] Write failing Web tests for 401 reauthentication, 403 permission messaging and absence of unauthorized retry in `apps/web/test/unit/features/profile/profile-errors.spec.tsx`

### Authorization implementation for User Story 4

- [ ] T097 [US4] Make every direct-Users adversarial case in T092 pass by hardening the US3 JWT strategy against unsigned/algorithm-confusion tokens, wrong key/issuer/audience, expiry and missing or non-canonical `sub`/`sid`, preserving 401 before authorization and repository access in `apps/users-service/src/interfaces/http/auth/jwt.strategy.ts`
- [ ] T098 [US4] Harden the US3 ownership guard so every authenticated mismatch, including ADMIN, returns 403 without existence disclosure or mutation in `apps/users-service/src/interfaces/http/guards/profile-ownership.guard.ts`
- [ ] T099 [US4] Implement reusable roles metadata/guard without granting unspecified permissions in `apps/api-gateway/src/modules/auth/roles.guard.ts` and `apps/users-service/src/interfaces/http/guards/roles.guard.ts`
- [ ] T100 [US4] Reject role, owner id, status, credential, version override and every unknown field before domain mutation in `apps/users-service/src/interfaces/http/profiles/update-profile.dto.ts`
- [ ] T101 [US4] Add regression coverage proving the US3 identity-header interceptor strips spoofed `x-user-*`, service-auth and forwarding identity headers while preserving only validated bearer/trace context in `apps/api-gateway/test/integration/identity-header-spoofing.spec.ts`
- [ ] T102 [US4] Implement Web 401/403 terminal-state behavior and safe field-error rendering in `apps/web/src/features/profile/profile-error.presenter.ts`
- [ ] T103 [US4] Generate/compare authorization/error Swagger responses and make all US4 suites green with FR-020–FR-024 coverage in `apps/*/test/`, `apps/*/src/interfaces/openapi/` and `specs/001-fundamentos-identidad/contracts/`

**Checkpoint**: Authorization and ownership behavior are independently demonstrable for every
actor defined in the specification.

---

## Phase 7: Polish and Cross-Cutting Verification

**Purpose**: Validate the complete feature, constitutional gates, operations and documentation
without introducing new behavior.

- [ ] T104 Write complete Playwright journeys for registration, login, protected profile update and changed-email login through HTTPS Gateway in `apps/web/test/e2e/identity-happy-path.spec.ts`
- [ ] T105 [P] Write Playwright/API E2E scenarios for duplicate registration, invalid credentials/JWT, cross-user 403, restricted fields and atomic rollback in `apps/web/test/e2e/identity-negative-paths.spec.ts`
- [ ] T106 [P] Write E2E scenarios for refresh rotation, seven-day limit, old-token replay, two concurrent refreshes and immediate invalidation of the renewed access token in `apps/web/test/e2e/refresh-replay.spec.ts`
- [ ] T107 Execute the 20-participant SC-001/SC-006 study exactly as specified (10 guest/10 owner, 10 invalid register/10 invalid profile, no assistance, all starts counted, thresholds 19/20 and 18/20) and retain consent plus de-identified aggregate evidence; run 20 Playwright SC-005 updates from submit to visible confirmation with threshold 19/20 under 5 s; and implement `apps/api-gateway/test/performance/identity.k6.ts` plus CI with a version/digest-pinned k6 image, trusted local CA, 100 ACTIVE users, 30 s warm-up and simultaneous 2-minute 25 req/s profile plus 25 req/s validation scenarios requiring per-operation p95<500 ms and unexpected errors<1%, recording commit/runner/resources/date/version/results without fabrication in `.github/workflows/ci.yml` and `docs/acceptance/identity-usability.md`
- [ ] T108 [P] Add security regression checks that responses, events and centralized/stdout logs contain no password, raw token, hash, email or photo bytes in `apps/api-gateway/test/security/secret-leakage.spec.ts`
- [ ] T109 [P] Add CI OpenAPI lint/drift tests for all three documents and validate every operation/security/error schema in `scripts/validate-openapi.mjs` and `.github/workflows/ci.yml`
- [ ] T110 [P] Enforce and report at least 70% affected-code coverage without weakening thresholds or skipping negative/concurrency suites in `jest.config.ts` and `.github/workflows/ci.yml`
- [ ] T111 Finalize Compose healthchecks, migration completion, TLS/secrets, non-root images, internal-only ports, explicit restart policies and RabbitMQ healthy-but-unused status in `docker-compose.yml` and `infra/docker/`
- [ ] T112 Validate centralized OTLP→Collector→Loki correlation by `traceId`, redaction and fallback logging in `infra/observability/` and `libs/observability/test/otel.integration.spec.ts`
- [ ] T113 Execute every scenario in `specs/001-fundamentos-identidad/quickstart.md`, update only inaccurate instructions, and record unresolved environmental prerequisites in that file
- [ ] T114 [P] Document workspace startup, migrations, Swagger locations, service ownership and safe local secrets in `README.md` and `docs/architecture/identity.md`
- [ ] T115 Reconcile `spec.md`, `plan.md`, `data-model.md`, OpenAPI and delivered tests for FR-001–FR-024, RQ-01 and RQ-02 traceability in `specs/001-fundamentos-identidad/traceability.md`
- [ ] T116 Review every criterion in `specs/001-fundamentos-identidad/checklists/identity-quality.md`, record findings without auto-checking reviewer-owned markers, and resolve any blocking requirements-quality discrepancy before completion
- [ ] T117 Run the full CI/Compose validation and require an independent team reviewer to record approval or blocking findings for constitutional compliance, traceability, coverage, OpenAPI drift and independent-story outcomes in `specs/001-fundamentos-identidad/validation-report.md`

---

## Dependencies and Execution Order

### Phase dependencies

```text
Phase 1 Setup
    ↓
Phase 2 Foundation (blocks every story)
    ↓
US1 Registration / RQ-02
    ↓
US2 Login, refresh and protected access
    ↓
US3 Profile read/update / RQ-01
    ↓
US4 Unauthorized modification controls
    ↓
Phase 7 Cross-cutting verification
```

- US1 depends only on Foundation and produces ACTIVE identity/credential fixtures.
- US2 depends on US1 because login requires an ACTIVE identity and credential.
- US3 depends on US2 because RQ-01 requires an authenticated session; its checkpoint also requires Users JWT revalidation, ownership enforcement and Gateway identity-header stripping.
- US4 depends on the secured US3 endpoints and adds adversarial authorization, mass-assignment and spoofing hardening without postponing baseline protection.
- Phase 7 depends on every story included in the release.

### Within each story

1. Write the story's tests and observe the expected failures.
2. Add schemas/migrations before repositories.
3. Implement domain/application behavior before controllers and Gateway routes.
4. Implement frontend after the public contract and route are stable.
5. Synchronize Swagger and run the story checkpoint before advancing.

## Parallel Opportunities

### Setup and Foundation

- After T001, T002–T005 and T007–T012 can be distributed by workspace/file ownership.
- T016 is a blocking consistency-verification gate for the recorded decisions; after it completes, T017–T019 are independent configuration files, while T021 implements Gateway/HTTPS/rate-limit configuration and T024 completes service authentication in both directions.
- T022/T023 and T026/T027 are separate services.
- T029 begins only after service skeletons exist; T031 waits for health and migration commands.

### User Story 1

```text
Parallel tests: T033, T034, T035, T036, T037, T038, T039, T040
Parallel schemas/migrations after tests: T041 with T042; then T043 with T044
Service stream after schemas: Users T045–T047 and Auth T048–T050 can progress separately
Join point: T051 Gateway → T052 Web → T053 contracts → T054 checkpoint
```

### User Story 2

```text
Parallel tests: T055–T061
After T063 migration: Users lookup T064 can progress while Auth security/session T065–T069 proceeds
Join point: T070 Gateway guards → T071 routes → T072 Web → T073/T074
```

### User Story 3

```text
Parallel tests: T075–T079
After T081 migration: validators/photo T082–T083 can progress before repository T084
T086 must complete Users JWT/ownership protection before T087 exposes the Gateway routes
After secured T086/T087: Web client T088 → T089 UI → T090 contracts → T091 security-inclusive checkpoint
```

### User Story 4

```text
Parallel tests: T092–T096
After adversarial tests: JWT T097, ownership T098 and role policy T099 are separable by files
Join point: T100–T102 behavior → T103 contract/checkpoint
```

### Polish

- T105–T106, T108–T110 and T114 can run in parallel after all story checkpoints because they
  affect distinct test/documentation files; T107 additionally waits for the scheduled usability
  participants and a CI runner capable of the recorded k6 profile.
- T111–T113 validate shared runtime artifacts and must finish before T115–T117 final evidence.

## Implementation Strategy

### MVP first

1. Complete Setup and Foundation.
2. Complete US1 through T054 to deliver RQ-02 registration as the first demonstrable increment.
3. Stop and validate US1 independently before starting session behavior.

Registration alone is the narrowest story MVP, but the Sprint 1 identity baseline requires US2
before any protected functionality can be considered usable.

### Incremental delivery

1. US1: account and public role assignment (RQ-02).
2. US2: login, JWT, refresh and protected access.
3. US3: own-profile consultation/editing (RQ-01).
4. US4: explicit ownership and unauthorized-access hardening.
5. Phase 7: complete operational, contract, security and constitutional evidence.

### Team strategy

- Finish Setup/Foundation collaboratively because they define shared contracts.
- Inside a story, split by Auth, Users, Gateway/Web and tests only at the parallel points above.
- Do not start downstream stories early by duplicating unfinished identity/session behavior.

## Notes

- `[P]` means different files and no unfinished dependency, not merely “could be done by another person.”
- Story labels provide traceability to `spec.md`; goals/checkpoints map RQ-01/RQ-02 explicitly.
- No RabbitMQ event task exists because the approved plan found no consumer or asynchronous fact
  in this feature; Compose still provisions and health-checks the broker.
- Commit after each task or coherent task group and preserve reviewer-owned checklist markers.
