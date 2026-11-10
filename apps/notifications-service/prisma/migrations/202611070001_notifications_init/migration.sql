CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'CHECKIN_REMINDER', 'SYSTEM_ALERT');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "recipientEmail" VARCHAR(254),
  "subject" VARCHAR(120) NOT NULL,
  "body" VARCHAR(5000) NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "failureReason" VARCHAR(64),
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestFingerprint" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMPTZ(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "Notification_status_sentAt_check" CHECK (("status" = 'SENT' AND "sentAt" IS NOT NULL) OR ("status" IN ('PENDING', 'FAILED') AND "sentAt" IS NULL))
);

CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification" ("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "Notification_userId_status_type_createdAt_id_idx" ON "Notification" ("userId", "status", "type", "createdAt" DESC, "id" DESC);
