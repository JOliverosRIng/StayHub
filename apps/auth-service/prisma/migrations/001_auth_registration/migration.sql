CREATE TYPE "CredentialStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');
CREATE TYPE "RegistrationState" AS ENUM (
  'STARTED',
  'USER_PENDING',
  'CREDENTIAL_PENDING',
  'CREDENTIAL_ACTIVE',
  'COMPLETED',
  'COMPENSATING',
  'CANCELLED'
);

CREATE TABLE "Credential" (
  "userId" UUID NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" "CredentialStatus" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Credential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "Registration" (
  "id" UUID NOT NULL,
  "requestFingerprint" CHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "state" "RegistrationState" NOT NULL DEFAULT 'STARTED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" VARCHAR(100),
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Registration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Registration_attemptCount_nonnegative" CHECK ("attemptCount" >= 0)
);

CREATE UNIQUE INDEX "Registration_userId_key" ON "Registration"("userId");
CREATE INDEX "Registration_state_expiresAt_idx" ON "Registration"("state", "expiresAt");
CREATE INDEX "Registration_state_attemptCount_updatedAt_idx"
  ON "Registration"("state", "attemptCount", "updatedAt");

