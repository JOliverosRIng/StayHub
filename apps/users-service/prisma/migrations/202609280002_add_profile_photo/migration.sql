CREATE TABLE "ProfilePhoto" (
  "userId" UUID PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "content" BYTEA NOT NULL CHECK (octet_length("content") BETWEEN 1 AND 5000000),
  "mediaType" VARCHAR(10) NOT NULL CHECK ("mediaType" IN ('image/jpeg', 'image/png')),
  "byteSize" INTEGER NOT NULL CHECK ("byteSize" BETWEEN 1 AND 5000000 AND "byteSize" = octet_length("content")),
  "sha256" CHAR(64) NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- User's primary key serves id+version updates; emailNormalized already has its unique index.
