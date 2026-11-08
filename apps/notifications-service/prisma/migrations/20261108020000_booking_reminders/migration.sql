CREATE TYPE "ScheduledNotificationStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "ScheduledNotification" (
    "id" UUID NOT NULL,
    "bookingId" VARCHAR(100) NOT NULL,
    "userId" UUID NOT NULL,
    "roomTitle" VARCHAR(120) NOT NULL,
    "roomLocation" VARCHAR(200) NOT NULL,
    "checkIn" VARCHAR(10) NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ScheduledNotificationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "claimedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduledNotification_bookingId_key" ON "ScheduledNotification"("bookingId");
CREATE INDEX "ScheduledNotification_status_scheduledAt_id_idx" ON "ScheduledNotification"("status", "scheduledAt", "id");
