CREATE TYPE "UserRole" AS ENUM ('GUEST', 'OWNER', 'ADMIN');
CREATE TYPE "RefreshTokenStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'REVOKED');

CREATE TABLE "Session" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "UserRole" NOT NULL,
  "absoluteExpiresAt" TIMESTAMPTZ(6) NOT NULL,
  "revokedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_version_positive" CHECK ("version" > 0),
  CONSTRAINT "Session_expiry_after_creation" CHECK ("absoluteExpiresAt" > "createdAt")
);

CREATE TABLE "RefreshToken" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "status" "RefreshTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "consumedAt" TIMESTAMPTZ(6),
  "replacedByTokenId" UUID,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshToken_expiry_after_issue" CHECK ("expiresAt" > "issuedAt"),
  CONSTRAINT "RefreshToken_consumption_consistent" CHECK (
    ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL)
    OR ("status" <> 'CONSUMED')
  )
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_absoluteExpiresAt_idx" ON "Session"("absoluteExpiresAt");
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE UNIQUE INDEX "RefreshToken_replacedByTokenId_key" ON "RefreshToken"("replacedByTokenId");
CREATE INDEX "RefreshToken_sessionId_status_idx" ON "RefreshToken"("sessionId", "status");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_replacedByTokenId_fkey"
  FOREIGN KEY ("replacedByTokenId") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RefreshToken_one_active_per_session"
  ON "RefreshToken"("sessionId") WHERE "status" = 'ACTIVE';

