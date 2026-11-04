import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { createBody, location } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';

describe('ACC-017 POST /properties persistence', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  const post = (body: unknown, sub: string = randomUUID()): request.Test => request(h.server).post('/properties').set('Authorization', bearer(sub)).send(body as object);

  it('persists the full aggregate as DRAFT version 1 owned by sub', async () => {
    const sub = randomUUID();
    const body = createBody({ rooms: [{ name: 'Principal', capacity: 2, basePrice: { amount: '120000.5', currency: 'COP' } }, { name: 'Auxiliar', capacity: 1 }] });
    const res = await post(body, sub).expect(201);
    const { id } = res.body as { id: string };
    const row = await h.db.property.findUniqueOrThrow({ where: { id }, include: { rooms: true, features: true } });
    expect(row).toMatchObject({ ownerId: sub, status: 'DRAFT', version: 1, name: body.name, country: 'CO', city: location.city });
    expect(row.rooms).toHaveLength(2);
    expect(row.rooms.find((room) => room.name === 'Principal')?.basePriceAmount?.toFixed(2)).toBe('120000.50');
    expect(row.rooms.find((room) => room.name === 'Auxiliar')?.basePriceAmount).toBeNull();
    expect(row.features.map((feature) => feature.featureCode).sort()).toEqual(['KITCHEN', 'WIFI']);
    expect(res.body).toMatchObject({
      id, ownerId: sub, location, features: [{ code: 'KITCHEN', name: 'Kitchen' }, { code: 'WIFI', name: 'Wi-Fi' }],
      rooms: expect.arrayContaining([expect.objectContaining({ name: 'Principal', basePrice: { amount: '120000.50', currency: 'COP' } })]) as unknown,
    });
  });

  it('omits unset optional location fields instead of returning nulls', async () => {
    const res = await post(createBody({ location: { addressLine: 'A', city: 'B', region: 'C', country: 'CO' } })).expect(201);
    expect((res.body as { location: unknown }).location).toEqual({ addressLine: 'A', city: 'B', region: 'C', country: 'CO' });
  });

  it('rejects an unknown featureCode with 400 and rolls back every row', async () => {
    const res = await post(createBody({ featureCodes: ['WIFI', 'TELEPORTER'] })).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'featureCodes', code: 'INVALID_VALUE' }] });
    expect(await Promise.all([h.db.property.count(), h.db.room.count(), h.db.propertyFeature.count()])).toEqual([0, 0, 0]);
  });

  it('never returns storage internals', async () => {
    const res = await post(createBody()).expect(201);
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey|basePriceAmount|addressLine":null/);
  });
});
