# Payments service validation report

**Scope:** `payments-service` only. Evidence collected on 2026-11-08 from the local branch `feat/payments-service`. No Bookings or Notifications client integration was performed.

## Automated validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Lint | PASS | `npm run lint:payments` |
| Typecheck | PASS | `npm run typecheck:payments` |
| Build | PASS | `npm run build:payments`; the Payments Docker runtime target also built in PAY-068. |
| Full test profile | PASS | 44 suites and 243 tests passed across unit, PostgreSQL/RabbitMQ integration, contract, security, and performance Jest projects. Runner: `apps/payments-service/test/scripts/run-integration.mjs --project all --coverage`. |
| Coverage | PASS | Statements 79.32%, branches 71.08%, functions 83.22%, lines 83.25%; all exceed 70%. No Jest project was omitted. |
| Performance | PASS | Full profile: `GET /payments/{id}/status` p95 6.35 ms; `POST /payments` p95 26.82 ms; 10 warmups + 40 HTTP samples each; limit <500 ms. See [`test/performance/README.md`](../../../apps/payments-service/test/performance/README.md). |
| Log security sweep | PASS | `test/security/log-sweep.spec.ts` passed; the full integration runner scanned structured Payments service records for bearer credentials, mock tokens, PAN-shaped values, authorization values, and idempotency keys. |
| Docker Compose smoke | PASS | Isolated Compose project, PostgreSQL 16, migrations 001 and 002 applied from a clean volume; RabbitMQ absent; readiness `degraded` with DB `up` and migration `applied`; `payments-service` restart policy `always`; after process termination, the service restarted and returned ready; the payment row and mock gateway ledger row both persisted (1 each). Temporary project, credentials, and volume were removed at the end. Runner: `apps/payments-service/test/scripts/compose-smoke.mjs`. |

The Compose smoke exposed and fixed two image/runtime defects: the migration command did not resolve `PAYMENTS_DATABASE_URL_FILE`, and the runtime image omitted the generated Prisma client and workspace-local runtime dependencies. The migration launcher and Payments Dockerfile now include those runtime requirements.

## Functional requirement evidence

| Requirement | Result | Evidence / limit |
| --- | --- | --- |
| PAY-FR-001 | PASS | Payments, refund, and status routes are exercised by `test/integration`, `test/contract`, and `test/security`. |
| PAY-FR-002 | PASS | Gateway is behind `PaymentGatewayPort`; deterministic cases and timeout behavior are covered by `test/unit/mock-payment-gateway.spec.ts` and PostgreSQL integration tests. |
| PAY-FR-003 | PASS | Integer minor units and currency validation covered by domain/config tests; schema stores amount in `BIGINT`. |
| PAY-FR-004 | PASS | DTO validation rejects unknown/invalid fields and PAN-shaped tokens; security and contract suites pass. |
| PAY-FR-005 | PASS | Same-key replay/conflict and request fingerprint covered by idempotency and create/refund integration tests. |
| PAY-FR-006 | PASS | Active-booking uniqueness is enforced by a PostgreSQL partial unique index; concurrent integration tests exercise persistence. |
| PAY-FR-007 | PASS | Explicit payment/refund state transition rules and invalid transitions are covered by domain unit tests. |
| PAY-FR-008 | PASS | Transactional refund balance enforcement, database constraint, and concurrent refund tests ensure refunded total cannot exceed payment amount. |
| PAY-FR-009 | PASS | Refund status, available balance, reason, and owner cancellation full-balance rules are covered by refund unit/contract/security tests. Cancellation policy remains with Bookings. |
| PAY-FR-010 | PASS | Payment and refund transition history and reconciliation evidence are stored and verified by persistence/reconciliation integration tests. |
| PAY-FR-011 | PASS | Outbox atomicity, RabbitMQ confirm publishing, ordering, retries, and dead-letter behavior are covered by PostgreSQL 16 + RabbitMQ integration tests. |
| PAY-FR-012 | PASS | Circuit breaker, definitive non-dispatch, and ambiguous timeout/PENDING behavior are covered by unit and integration tests. |
| PAY-FR-013 | PASS | Payment/refund reconciliation claims PostgreSQL work with `SKIP LOCKED`; tests cover concurrent claims and provider checks outside the claim transaction. |
| PAY-FR-014 | PASS | RS256 issuer/audience/kid/expiry/scope/role checks and authorization boundaries are covered by JWT and route security suites. |
| PAY-FR-015 | PASS | Stable problem responses and redaction are covered by mapper/filter and security tests. |
| PAY-FR-016 | PASS | Persistence uses the service-owned `payments_db`; no cross-service database access was added. |
| PAY-FR-017 | PASS | Liveness/readiness tests and Compose smoke verify database/migration readiness with broker absence reported as degraded. |
| PAY-FR-018 | PARTIAL | OpenAPI 3.1 and event JSON Schema drift are covered by existing contract tests. PAY-065's requested root validator and CI job remain pending the team approval explicitly required by `tasks.md`; no CI claim is made here. |
| PAY-FR-019 | PARTIAL | Payment/refund escalation to `REVIEW_REQUIRED`, durable audit/outbox event, and retained blocking are implemented and tested. A manual evidence-based operator resolution workflow is not exposed in this increment. |
| PAY-FR-020 | PASS | The durable mock ledger is exercised across adapter/Prisma restarts and the Compose smoke verifies persisted mock ledger data after service restart; sensitive payment tokens are not stored in the ledger. |

## Non-functional requirement evidence

| Requirement | Result | Evidence / limit |
| --- | --- | --- |
| PAY-NFR-001 | PASS | Both measured HTTP p95 values are below 500 ms; this local profile is not a production latency guarantee. |
| PAY-NFR-002 | PASS | Compose defines `restart: always`; crash/restart and degraded readiness were verified with the isolated Compose smoke. |
| PAY-NFR-003 | PASS | No PAN/CVV accepted or persisted; recursive log redaction, JWT boundaries, and access control covered by security suites and captured-log sweep. |
| PAY-NFR-004 | PASS | Idempotency, active payment uniqueness, refund concurrency, uncertain outcomes, and reconciliation tests cover duplicate/over-refund protections. |
| PAY-NFR-005 | PASS | Layered service structure, lint, strict TypeScript typecheck, and build all pass. |
| PAY-NFR-006 | PASS | Payments database, migrations, runtime image, and health checks passed the real Compose smoke. |
| PAY-NFR-007 | PASS | Coverage exceeds 70% in all four metrics; all five Jest projects ran. Database concurrency and persistence use PostgreSQL 16. |
| PAY-NFR-008 | PASS | OTLP instrumentation, Prometheus health metrics, and relay/reconciliation measurements are implemented; unit and integration suites pass. |

## Source requirement status and remaining integration

The related product requirements are **partially covered**, not end-to-end complete:

- **RQ-07 (create reservation):** Payments accepts and processes a Bookings-calculated charge, but Bookings owns availability, price calculation, reservation creation, and confirmation. The Bookings service/client integration is outstanding.
- **RQ-09 (guest cancellation):** Payments executes the full or partial refund Bookings orders. Bookings owns eligibility, cancellation policy, and availability release; its integration is outstanding.
- **RQ-10 (owner cancellation):** Payments enforces full refund for `OWNER_CANCELLATION`; Bookings owns the cancellation flow, while Notifications owns the guest notice. Both consumer integrations are outstanding.

The real Bookings and Notifications clients, deployed broker topology/credentials, and cross-service end-to-end behavior are intentionally outside this Payments-only increment. The consumer contract is documented in [`CONSUMER-HANDOFF.md`](../../../apps/payments-service/test/fixtures/CONSUMER-HANDOFF.md).

## Pending shared change

PAY-065 asks for a root OpenAPI validation script and a `payments-quality` job in `.github/workflows/ci.yml`. Its task explicitly says to present the diff and wait for team approval before editing the root/workflow. The workflow currently contains unresolved merge conflict markers, so this report leaves PAY-065 open and records the proposed changes separately for review.
