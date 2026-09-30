CREATE TYPE "SessionRevokeReason" AS ENUM (
  'REFRESH_REUSE',
  'EXPIRED',
  'SECURITY',
  'USER_INACTIVE'
);

ALTER TABLE "Session" ADD COLUMN "revokeReason" "SessionRevokeReason";

UPDATE "Session"
SET "revokeReason" = 'SECURITY'
WHERE "revokedAt" IS NOT NULL;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_revoke_reason_consistent" CHECK (
    ("revokedAt" IS NULL AND "revokeReason" IS NULL)
    OR ("revokedAt" IS NOT NULL AND "revokeReason" IS NOT NULL)
  );
