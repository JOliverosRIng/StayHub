CREATE TYPE "CancellationActor" AS ENUM ('GUEST', 'OWNER', 'SYSTEM');

ALTER TABLE bookings
  ADD COLUMN "cancellationPolicyVersion" VARCHAR(80),
  ADD COLUMN "cancelledBy" "CancellationActor",
  ADD COLUMN "cancellationReason" VARCHAR(500),
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6),
  ADD COLUMN "checkedInAt" TIMESTAMPTZ(6),
  ADD COLUMN "checkedOutAt" TIMESTAMPTZ(6);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_cancelled_at_consistent
    CHECK (("cancelledBy" IS NULL) = ("cancelledAt" IS NULL)),
  ADD CONSTRAINT bookings_owner_reason_required
    CHECK ("cancelledBy" IS DISTINCT FROM 'OWNER' OR ("cancellationReason" IS NOT NULL AND length(btrim("cancellationReason")) > 0));
