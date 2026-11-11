ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_REVIEW_REQUIRED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_FAILED';

CREATE TYPE "NotificationOperation" AS ENUM ('BOOKING_CONFIRMED');

CREATE TABLE "notification_work" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "operation" "NotificationOperation" NOT NULL DEFAULT 'BOOKING_CONFIRMED',
    "status" "WorkStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_work_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_work_bookingId_operation_key" ON "notification_work"("bookingId", "operation");
CREATE INDEX "notification_work_status_nextAttemptAt_idx" ON "notification_work"("status", "nextAttemptAt");

ALTER TABLE "notification_work"
    ADD CONSTRAINT "notification_work_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
