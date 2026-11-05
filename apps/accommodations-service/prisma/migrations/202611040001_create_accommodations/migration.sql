-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOTEL', 'APARTMENT', 'HOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateTable
CREATE TABLE "Property" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "type" "PropertyType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(5000),
    "addressLine" VARCHAR(200) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "region" VARCHAR(100) NOT NULL,
    "country" CHAR(2) NOT NULL,
    "postalCode" VARCHAR(20),
    "latitude" DECIMAL(9,7),
    "longitude" DECIMAL(10,7),
    "status" "PropertyStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Property_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "Property_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "Property_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
    CONSTRAINT "Property_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "basePriceAmount" DECIMAL(12,2),
    "basePriceCurrency" CHAR(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Room_capacity_check" CHECK ("capacity" >= 1),
    CONSTRAINT "Room_basePrice_pair_check" CHECK (("basePriceAmount" IS NULL) = ("basePriceCurrency" IS NULL)),
    CONSTRAINT "Room_basePriceAmount_check" CHECK ("basePriceAmount" > 0),
    CONSTRAINT "Room_basePriceCurrency_check" CHECK ("basePriceCurrency" ~ '^[A-Z]{3}$')
);

-- CreateTable
CREATE TABLE "Feature" (
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "PropertyFeature" (
    "propertyId" UUID NOT NULL,
    "featureCode" VARCHAR(64) NOT NULL,

    CONSTRAINT "PropertyFeature_pkey" PRIMARY KEY ("propertyId","featureCode")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "storageKey" VARCHAR(64) NOT NULL,
    "mediaType" VARCHAR(10) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Photo_mediaType_check" CHECK ("mediaType" IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT "Photo_byteSize_check" CHECK ("byteSize" BETWEEN 1 AND 5000000),
    -- Positions 0..9 together with the unique (propertyId, position) index cap a property at ten photos.
    CONSTRAINT "Photo_position_check" CHECK ("position" BETWEEN 0 AND 9)
);

-- CreateIndex
CREATE INDEX "Property_ownerId_status_idx" ON "Property"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Room_propertyId_idx" ON "Room"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyFeature_featureCode_idx" ON "PropertyFeature"("featureCode");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_storageKey_key" ON "Photo"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_propertyId_position_key" ON "Photo"("propertyId", "position");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyFeature" ADD CONSTRAINT "PropertyFeature_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyFeature" ADD CONSTRAINT "PropertyFeature_featureCode_fkey" FOREIGN KEY ("featureCode") REFERENCES "Feature"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
