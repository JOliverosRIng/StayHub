import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, withRollback, type Harness } from './postgres.setup';
import { REQUIRED_MIGRATIONS } from '../../src/infrastructure/persistence/prisma/prisma.service';

describe('ACC-010/012 migrations, readiness and database constraints', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  const insertProperty = async (id = randomUUID()): Promise<string> => {
    await h.db.$executeRaw`INSERT INTO "Property" ("id", "ownerId", "type", "name", "addressLine", "city", "region", "country", "updatedAt") VALUES (${id}::uuid, ${randomUUID()}::uuid, 'HOUSE', 'Casa', 'A', 'B', 'C', 'CO', now())`;
    return id;
  };

  it('applies exactly the versioned migrations required by readiness', async () => {
    const rows = await h.db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
    expect(rows.map((row) => row.migration_name)).toEqual([...REQUIRED_MIGRATIONS]);
    expect(REQUIRED_MIGRATIONS).toEqual(['202611040001_create_accommodations', '202611040002_seed_feature_catalog']);
  });

  it('readiness requires every migration to be applied', async () => {
    await request(h.server).get('/health/ready').expect(200);
    await h.db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NULL WHERE migration_name = '202611040002_seed_feature_catalog'`;
    try {
      await request(h.server).get('/health/live').expect(200);
      await request(h.server).get('/health/ready').expect(503);
    } finally {
      await h.db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = CURRENT_TIMESTAMP WHERE migration_name = '202611040002_seed_feature_catalog'`;
    }
  });

  it('rolls back a test transaction without leaving rows', async () => {
    await withRollback(h.db, async (tx) => {
      await tx.$executeRaw`INSERT INTO "Property" ("id", "ownerId", "type", "name", "addressLine", "city", "region", "country", "updatedAt") VALUES (${randomUUID()}::uuid, ${randomUUID()}::uuid, 'HOUSE', 'Casa', 'A', 'B', 'C', 'CO', now())`;
      expect(await tx.property.count()).toBe(1);
    });
    expect(await h.db.property.count()).toBe(0);
  });

  it('defaults new properties to DRAFT, version 1 and no description', async () => {
    const id = await insertProperty();
    expect(await h.db.property.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'DRAFT', version: 1, description: null });
  });

  it.each([
    ['country lowercase', `UPDATE "Property" SET "country" = 'co'`],
    ['latitude out of range', `UPDATE "Property" SET "latitude" = 90.5`],
    ['longitude out of range', `UPDATE "Property" SET "longitude" = -180.5`],
    ['version below 1', `UPDATE "Property" SET "version" = 0`],
    ['unknown type', `UPDATE "Property" SET "type" = 'CASTLE'`],
    ['name over 120', `UPDATE "Property" SET "name" = repeat('x', 121)`],
    ['description over 5000', `UPDATE "Property" SET "description" = repeat('x', 5001)`],
  ])('rejects property row with %s', async (_case, sql) => {
    await insertProperty();
    await expect(h.db.$executeRawUnsafe(sql)).rejects.toThrow();
  });

  it.each([
    ['capacity 0', `0, NULL, NULL`],
    ['zero amount', `1, 0, 'USD'`],
    ['amount without currency', `1, 10, NULL`],
    ['currency without amount', `1, NULL, 'USD'`],
    ['lowercase currency', `1, 10, 'usd'`],
  ])('rejects room with %s', async (_case, values) => {
    const propertyId = await insertProperty();
    await expect(h.db.$executeRawUnsafe(`INSERT INTO "Room" ("id", "propertyId", "name", "capacity", "basePriceAmount", "basePriceCurrency", "updatedAt") VALUES ('${randomUUID()}', '${propertyId}', 'R', ${values}, now())`)).rejects.toThrow();
  });

  it('stores price as Decimal(12,2) and rejects more than 10 integer digits', async () => {
    const propertyId = await insertProperty(); const id = randomUUID();
    await h.db.$executeRawUnsafe(`INSERT INTO "Room" ("id", "propertyId", "name", "capacity", "basePriceAmount", "basePriceCurrency", "updatedAt") VALUES ('${id}', '${propertyId}', 'R', 1, 9999999999.99, 'USD', now())`);
    expect((await h.db.room.findUniqueOrThrow({ where: { id } })).basePriceAmount?.toFixed(2)).toBe('9999999999.99');
    await expect(h.db.$executeRawUnsafe(`UPDATE "Room" SET "basePriceAmount" = 10000000000 WHERE "id" = '${id}'`)).rejects.toThrow();
  });

  it.each([
    ['byteSize 0', `'image/png', 0, 0`],
    ['byteSize over 5000000', `'image/png', 5000001, 0`],
    ['unsupported media type', `'image/gif', 10, 0`],
    ['position 10', `'image/png', 10, 10`],
    ['negative position', `'image/png', 10, -1`],
  ])('rejects photo metadata with %s', async (_case, values) => {
    const propertyId = await insertProperty();
    await expect(h.db.$executeRawUnsafe(`INSERT INTO "Photo" ("id", "propertyId", "storageKey", "mediaType", "byteSize", "position") VALUES ('${randomUUID()}', '${propertyId}', '${randomUUID()}', ${values})`)).rejects.toThrow();
  });

  it('enforces unique photo positions and storage keys per property', async () => {
    const propertyId = await insertProperty(); const key = randomUUID();
    await h.db.photo.create({ data: { id: randomUUID(), propertyId, storageKey: key, mediaType: 'image/png', byteSize: 5_000_000, position: 0 } });
    await expect(h.db.photo.create({ data: { id: randomUUID(), propertyId, storageKey: randomUUID(), mediaType: 'image/png', byteSize: 1, position: 0 } })).rejects.toThrow();
    await expect(h.db.photo.create({ data: { id: randomUUID(), propertyId, storageKey: key, mediaType: 'image/png', byteSize: 1, position: 1 } })).rejects.toThrow();
  });

  it('cascades rooms, features and photo metadata with the property', async () => {
    const propertyId = await insertProperty();
    await h.db.room.create({ data: { id: randomUUID(), propertyId, name: 'R', capacity: 1 } });
    await h.db.propertyFeature.create({ data: { propertyId, featureCode: 'WIFI' } });
    await h.db.photo.create({ data: { id: randomUUID(), propertyId, storageKey: randomUUID(), mediaType: 'image/webp', byteSize: 1, position: 0 } });
    await h.db.property.delete({ where: { id: propertyId } });
    expect([await h.db.room.count(), await h.db.propertyFeature.count(), await h.db.photo.count()]).toEqual([0, 0, 0]);
  });
});
