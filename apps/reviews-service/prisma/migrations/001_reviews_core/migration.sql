CREATE TABLE "reviews" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "propertyId" UUID NOT NULL,
  "guestId" UUID NOT NULL,
  "rating" SMALLINT NOT NULL,
  "comment" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "reviews_comment_check" CHECK (char_length(btrim("comment")) BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");
CREATE INDEX "reviews_propertyId_createdAt_id_idx" ON "reviews"("propertyId", "createdAt" DESC, "id" DESC);
CREATE INDEX "reviews_guestId_createdAt_id_idx" ON "reviews"("guestId", "createdAt" DESC, "id" DESC);
