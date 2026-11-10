ALTER TABLE "refunds"
  ADD COLUMN "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_reconcile_at" TIMESTAMPTZ(6);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_reconcile_attempts_nonnegative" CHECK ("reconcile_attempts" >= 0);

UPDATE "refunds"
SET "next_reconcile_at" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING' AND "failure_code" = 'GATEWAY_TIMEOUT'
  AND "gateway_reference" IS NOT NULL;

CREATE INDEX "refunds_pending_reconciliation_idx"
  ON "refunds" ("next_reconcile_at", "created_at", "id")
  WHERE "status" = 'PENDING' AND "next_reconcile_at" IS NOT NULL;
