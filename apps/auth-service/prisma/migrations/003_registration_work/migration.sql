ALTER TABLE "Registration"
  ADD COLUMN "processingOwner" UUID,
  ADD COLUMN "leaseUntil" TIMESTAMPTZ(6),
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Registration"
  ADD CONSTRAINT "Registration_lease_consistent" CHECK (
    ("processingOwner" IS NULL AND "leaseUntil" IS NULL)
    OR ("processingOwner" IS NOT NULL AND "leaseUntil" IS NOT NULL)
  );

CREATE INDEX "Registration_state_nextAttemptAt_leaseUntil_idx"
  ON "Registration"("state", "nextAttemptAt", "leaseUntil");
