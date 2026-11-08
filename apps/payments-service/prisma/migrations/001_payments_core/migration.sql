CREATE TYPE "payment_status" AS ENUM (
  'PENDING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'DECLINED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED'
);

CREATE TYPE "refund_status" AS ENUM (
  'PENDING',
  'REVIEW_REQUIRED',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "refund_reason" AS ENUM (
  'GUEST_CANCELLATION',
  'OWNER_CANCELLATION'
);

CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PUBLISHED', 'DEAD');
CREATE TYPE "gateway_operation_kind" AS ENUM ('CHARGE', 'REFUND');
CREATE TYPE "gateway_operation_result" AS ENUM (
  'APPROVED',
  'DECLINED',
  'REFUND_COMPLETED',
  'REFUND_FAILED',
  'UNKNOWN'
);
CREATE TYPE "refund_fixture_result" AS ENUM ('NORMAL', 'REFUND_DECLINED');

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "payer_user_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "payment_status" NOT NULL DEFAULT 'PENDING',
  "refunded_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "failure_code" TEXT,
  "payment_method_type" TEXT NOT NULL DEFAULT 'CARD_TOKEN',
  "payment_method_fingerprint" CHAR(64) NOT NULL,
  "gateway_reference" TEXT,
  "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
  "next_reconcile_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMPTZ(6),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_id_currency_key" UNIQUE ("id", "currency"),
  CONSTRAINT "payments_amount_minor_range" CHECK ("amount_minor" BETWEEN 1 AND 9000000000000),
  CONSTRAINT "payments_currency_supported" CHECK ("currency" IN ('COP', 'USD')),
  CONSTRAINT "payments_refunded_amount_range" CHECK (
    "refunded_amount_minor" >= 0 AND "refunded_amount_minor" <= "amount_minor"
  ),
  CONSTRAINT "payments_method_type_supported" CHECK ("payment_method_type" = 'CARD_TOKEN'),
  CONSTRAINT "payments_fingerprint_format" CHECK ("payment_method_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payments_reconcile_attempts_nonnegative" CHECK ("reconcile_attempts" >= 0),
  CONSTRAINT "payments_version_positive" CHECK ("version" >= 1)
);

CREATE TABLE "refunds" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "reason" "refund_reason" NOT NULL,
  "status" "refund_status" NOT NULL DEFAULT 'PENDING',
  "failure_code" TEXT,
  "gateway_reference" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refunds_amount_minor_range" CHECK ("amount_minor" BETWEEN 1 AND 9000000000000),
  CONSTRAINT "refunds_currency_supported" CHECK ("currency" IN ('COP', 'USD')),
  CONSTRAINT "refunds_payment_id_currency_fkey" FOREIGN KEY ("payment_id", "currency")
    REFERENCES "payments" ("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL,
  "scope" TEXT NOT NULL,
  "key" UUID NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "caller_subject" TEXT NOT NULL,
  "response_status" INTEGER,
  "response_body" JSONB,
  "resource_id" UUID,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_fingerprint_format" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "idempotency_response_status_range" CHECK (
    "response_status" IS NULL OR "response_status" BETWEEN 100 AND 599
  ),
  CONSTRAINT "idempotency_expiry_after_creation" CHECK ("expires_at" > "created_at")
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_event_type_supported" CHECK ("event_type" IN (
    'payment.v1.approved',
    'payment.v1.declined',
    'payment.v1.failed',
    'payment.v1.refunded',
    'payment.v1.refund_failed',
    'payment.v1.review_required',
    'payment.v1.refund_review_required'
  )),
  CONSTRAINT "outbox_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "outbox_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "outbox_published_timestamp_consistent" CHECK (
    ("status" = 'PUBLISHED') = ("published_at" IS NOT NULL)
  )
);

CREATE TABLE "payment_status_history" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "from_status" "payment_status",
  "to_status" "payment_status" NOT NULL,
  "reason_code" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "evidence_ref_hash" CHAR(64),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_status_history_evidence_format" CHECK (
    "evidence_ref_hash" IS NULL OR "evidence_ref_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "payment_status_history_payment_id_fkey" FOREIGN KEY ("payment_id")
    REFERENCES "payments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "refund_status_history" (
  "id" UUID NOT NULL,
  "refund_id" UUID NOT NULL,
  "from_status" "refund_status",
  "to_status" "refund_status" NOT NULL,
  "reason_code" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "evidence_ref_hash" CHAR(64),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_status_history_evidence_format" CHECK (
    "evidence_ref_hash" IS NULL OR "evidence_ref_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "refund_status_history_refund_id_fkey" FOREIGN KEY ("refund_id")
    REFERENCES "refunds" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- The mock ledger stores only opaque references and synthetic outcomes; it is not used by production flows.
CREATE TABLE "mock_gateway_operations" (
  "operation_ref_hash" CHAR(64) NOT NULL,
  "kind" "gateway_operation_kind" NOT NULL,
  "result" "gateway_operation_result" NOT NULL,
  "failure_code" TEXT,
  "refund_fixture_result" "refund_fixture_result",
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "mock_gateway_operations_pkey" PRIMARY KEY ("operation_ref_hash"),
  CONSTRAINT "mock_gateway_kind_operation_hash_uq" UNIQUE ("kind", "operation_ref_hash"),
  CONSTRAINT "mock_gateway_operations_hash_format" CHECK ("operation_ref_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "mock_gateway_operations_kind_result" CHECK (
    ("kind" = 'CHARGE' AND "result" IN ('APPROVED', 'DECLINED', 'UNKNOWN')) OR
    ("kind" = 'REFUND' AND "result" IN ('REFUND_COMPLETED', 'REFUND_FAILED', 'UNKNOWN'))
  ),
  CONSTRAINT "mock_gateway_refund_fixture_charge_only" CHECK (
    "refund_fixture_result" IS NULL OR "kind" = 'CHARGE'
  )
);

CREATE UNIQUE INDEX "payments_active_booking_uq"
  ON "payments" ("booking_id")
  WHERE "status" IN ('PENDING', 'REVIEW_REQUIRED', 'APPROVED', 'PARTIALLY_REFUNDED');

CREATE INDEX "payments_payer_user_created_idx"
  ON "payments" ("payer_user_id", "created_at" DESC);
CREATE INDEX "payments_reconcile_due_idx"
  ON "payments" ("next_reconcile_at", "id")
  WHERE "status" = 'PENDING' AND "next_reconcile_at" IS NOT NULL;
CREATE INDEX "refunds_payment_created_idx"
  ON "refunds" ("payment_id", "created_at");
CREATE UNIQUE INDEX "refunds_one_inflight_per_payment_uq"
  ON "refunds" ("payment_id")
  WHERE "status" IN ('PENDING', 'REVIEW_REQUIRED');
CREATE UNIQUE INDEX "idempotency_scope_key_caller_uq"
  ON "idempotency_records" ("scope", "key", "caller_subject");
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_records" ("expires_at");
CREATE INDEX "outbox_pending_due_idx"
  ON "outbox_events" ("next_attempt_at", "created_at", "id")
  WHERE "status" = 'PENDING';
CREATE INDEX "outbox_aggregate_order_idx"
  ON "outbox_events" ("aggregate_id", "created_at", "id");
CREATE INDEX "payment_status_history_payment_time_idx"
  ON "payment_status_history" ("payment_id", "occurred_at");
CREATE INDEX "refund_status_history_refund_time_idx"
  ON "refund_status_history" ("refund_id", "occurred_at");

CREATE FUNCTION "reject_status_history_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'status history is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "payment_status_history_append_only"
  BEFORE UPDATE OR DELETE ON "payment_status_history"
  FOR EACH ROW EXECUTE FUNCTION "reject_status_history_mutation"();
CREATE TRIGGER "refund_status_history_append_only"
  BEFORE UPDATE OR DELETE ON "refund_status_history"
  FOR EACH ROW EXECUTE FUNCTION "reject_status_history_mutation"();
