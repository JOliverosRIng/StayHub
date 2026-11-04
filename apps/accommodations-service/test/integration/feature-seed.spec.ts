import { randomUUID } from 'node:crypto';
import { postgresHarness, type Harness } from './postgres.setup';
import { FEATURE_CATALOG } from '../../src/domain/features/feature-catalog';
import { seedFeatureCatalog } from '../../prisma/seed';

describe('ACC-010/012 versioned Feature catalog seed', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });

  const catalog = async (): Promise<{ code: string; name: string }[]> => h.db.feature.findMany({ orderBy: { code: 'asc' }, select: { code: true, name: true } });

  it('the versioned migration installs exactly the v1 catalog', async () => {
    expect(await catalog()).toEqual([...FEATURE_CATALOG].sort((a, b) => a.code.localeCompare(b.code)));
    expect(FEATURE_CATALOG.map((f) => f.code)).toEqual(['WIFI', 'PARKING', 'POOL', 'AIR_CONDITIONING', 'KITCHEN', 'PETS_ALLOWED', 'BREAKFAST_INCLUDED']);
  });

  it('the seed script is idempotent and restores catalog names', async () => {
    await h.db.feature.update({ where: { code: 'WIFI' }, data: { name: 'Changed' } });
    await seedFeatureCatalog(h.db);
    await seedFeatureCatalog(h.db);
    expect(await catalog()).toEqual([...FEATURE_CATALOG].sort((a, b) => a.code.localeCompare(b.code)));
  });

  it('PropertyFeature only references catalog codes and rejects duplicates', async () => {
    const propertyId = randomUUID();
    await h.db.property.create({ data: { id: propertyId, ownerId: randomUUID(), type: 'HOTEL', name: 'Hotel', addressLine: 'A', city: 'B', region: 'C', country: 'CO' } });
    await h.db.propertyFeature.create({ data: { propertyId, featureCode: 'POOL' } });
    await expect(h.db.propertyFeature.create({ data: { propertyId, featureCode: 'POOL' } })).rejects.toThrow();
    await expect(h.db.propertyFeature.create({ data: { propertyId, featureCode: 'SPA' } })).rejects.toThrow();
    await h.db.property.delete({ where: { id: propertyId } });
  });
});
