CREATE TYPE "Role" AS ENUM ('GUEST', 'OWNER', 'ADMIN');
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED');
CREATE TABLE "User" (
  "id" UUID PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL CHECK (char_length("name") BETWEEN 2 AND 100 AND "name" = btrim("name")),
  "email" VARCHAR(254) NOT NULL,
  "emailNormalized" VARCHAR(254) NOT NULL CHECK ("emailNormalized" = lower(btrim("email"))),
  "role" "Role" NOT NULL,
  "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
  "phone" VARCHAR(16),
  "preferences" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "registrationId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");
CREATE UNIQUE INDEX "User_registrationId_key" ON "User"("registrationId");
