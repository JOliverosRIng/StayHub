CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TYPE "ProjectionOutcome" AS ENUM ('APPLIED', 'IGNORED_STALE', 'REMOVED');
CREATE TABLE "search_documents" (
  "accommodationId" UUID PRIMARY KEY, "projectionVersion" BIGINT NOT NULL CHECK ("projectionVersion" > 0), "published" BOOLEAN NOT NULL DEFAULT FALSE,
  "name" VARCHAR(160) NOT NULL CHECK (length(btrim("name")) > 0), "description" TEXT NOT NULL, "countryCode" CHAR(2) NOT NULL CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  "region" VARCHAR(120), "city" VARCHAR(120) NOT NULL CHECK (length(btrim("city")) > 0), "addressSummary" VARCHAR(240), "location" geography(Point,4326),
  "minNightlyPrice" NUMERIC(12,2) NOT NULL CHECK ("minNightlyPrice" >= 0), "currency" CHAR(3) NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'), "capacity" INTEGER NOT NULL CHECK ("capacity" > 0),
  "amenities" TEXT[] NOT NULL DEFAULT '{}', "keywords" TEXT[] NOT NULL DEFAULT '{}', "primaryPhotoUrl" TEXT,
  "searchVector" TSVECTOR NOT NULL DEFAULT ''::tsvector,
  "sourceUpdatedAt" TIMESTAMPTZ NOT NULL, "indexedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE "availability_windows" ("id" UUID PRIMARY KEY, "accommodationId" UUID NOT NULL REFERENCES "search_documents"("accommodationId") ON DELETE CASCADE, "startDate" DATE NOT NULL, "endDate" DATE NOT NULL, "availableCapacity" INTEGER NOT NULL CHECK ("availableCapacity" > 0), "projectionVersion" BIGINT NOT NULL CHECK ("projectionVersion" > 0), CHECK ("endDate" > "startDate"));
CREATE TABLE "processed_projection_events" ("eventId" UUID PRIMARY KEY, "eventType" VARCHAR(100) NOT NULL, "accommodationId" UUID NOT NULL, "projectionVersion" BIGINT NOT NULL, "payloadHash" CHAR(64) NOT NULL, "outcome" "ProjectionOutcome" NOT NULL, "processedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE "projection_cursors" ("accommodationId" UUID PRIMARY KEY, "projectionVersion" BIGINT NOT NULL CHECK ("projectionVersion" > 0), "removed" BOOLEAN NOT NULL DEFAULT FALSE, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE "search_index_state" ("id" SMALLINT PRIMARY KEY CHECK ("id" = 1), "cacheGeneration" BIGINT NOT NULL DEFAULT 0, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO "search_index_state" ("id") VALUES (1);
CREATE FUNCTION "search_documents_vector_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('simple', coalesce(NEW."name", '') || ' ' || coalesce(NEW."city", '') || ' ' || coalesce(NEW."region", '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(NEW."keywords", ' ') || ' ' || array_to_string(NEW."amenities", ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW."description", '')), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER "search_documents_vector_trigger"
BEFORE INSERT OR UPDATE OF "name", "city", "region", "keywords", "amenities", "description"
ON "search_documents" FOR EACH ROW EXECUTE FUNCTION "search_documents_vector_update"();
CREATE INDEX "search_documents_published_price_capacity_idx" ON "search_documents" ("published", "minNightlyPrice", "capacity") WHERE "published" = TRUE;
CREATE INDEX "search_documents_currency_price_idx" ON "search_documents" ("currency", "minNightlyPrice");
CREATE INDEX "search_documents_search_vector_idx" ON "search_documents" USING GIN ("searchVector");
CREATE INDEX "search_documents_name_trgm_idx" ON "search_documents" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "search_documents_city_trgm_idx" ON "search_documents" USING GIN ("city" gin_trgm_ops);
CREATE INDEX "search_documents_amenities_idx" ON "search_documents" USING GIN ("amenities");
CREATE INDEX "search_documents_location_idx" ON "search_documents" USING GIST ("location");
CREATE INDEX "availability_accommodation_dates_idx" ON "availability_windows" ("accommodationId", "startDate", "endDate");
CREATE INDEX "availability_dates_capacity_idx" ON "availability_windows" ("startDate", "endDate", "availableCapacity");
CREATE INDEX "processed_projection_accommodation_version_idx" ON "processed_projection_events" ("accommodationId", "projectionVersion");
