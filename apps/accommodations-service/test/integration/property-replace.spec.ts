import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { createBody, replaceFrom } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';

describe('ACC-025 PUT /properties/{id} nested replacement', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(sub = randomUUID()): Promise<{ property: Record<string, unknown> & { id: string; rooms: { id: string; name: string }[] }; auth: string }> {
    const auth = bearer(sub);
    const res = await request(h.server).post('/properties').set('Authorization', auth).send(createBody({
      rooms: [{ name: 'A', capacity: 1, basePrice: { amount: '10.00', currency: 'COP' } }, { name: 'B', capacity: 2 }],
    })).expect(201);
    return { property: res.body as never, auth };
  }
  const put = (id: string, body: unknown, auth: string): request.Test => request(h.server).put(`/properties/${id}`).set('Authorization', auth).send(body as object);

  it('updates kept rooms, creates rooms without id, deletes omitted rooms and increments version', async () => {
    const { property, auth } = await seed();
    const kept = property.rooms.find((room) => room.name === 'A');
    const res = await put(property.id, replaceFrom(property as never, {
      rooms: [{ id: kept?.id, name: 'A+', capacity: 4, basePrice: { amount: '15.5', currency: 'USD' } }, { name: 'C', capacity: 1 }],
      featureCodes: ['POOL'],
    }), auth).expect(200);
    expect(res.body).toMatchObject({ version: 2, features: [{ code: 'POOL', name: 'Pool' }] });
    const rooms = (res.body as { rooms: { id: string; name: string; capacity: number; basePrice: unknown }[] }).rooms;
    expect(rooms).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: kept?.id, name: 'A+', capacity: 4, basePrice: { amount: '15.50', currency: 'USD' } }),
      expect.objectContaining({ name: 'C', capacity: 1, basePrice: null }),
    ]));
    expect(rooms).toHaveLength(2);
    expect(await h.db.room.count({ where: { propertyId: property.id } })).toBe(2);
  });

  it('clears description and basePrice when omitted and keeps at least one room', async () => {
    const { property, auth } = await seed();
    const kept = property.rooms[0];
    const res = await put(property.id, {
      type: property.type, name: property.name, location: property.location, status: 'DRAFT', version: 1,
      rooms: [{ id: kept?.id, name: kept?.name, capacity: 1 }],
    }, auth).expect(200);
    expect(res.body).toMatchObject({ description: null, rooms: [{ id: kept?.id, basePrice: null }] });
  });

  it('rolls back when a room id is unknown, including ids from another property', async () => {
    const { property, auth } = await seed();
    const other = await seed();
    const foreignRoom = other.property.rooms[0]?.id;
    const res = await put(property.id, replaceFrom(property as never, { name: 'No', rooms: [{ id: foreignRoom, name: 'X', capacity: 1 }] }), auth).expect(400);
    expect(res.body).toMatchObject({ errors: [{ field: 'rooms[0].id' }] });
    const persisted = await request(h.server).get(`/properties/${property.id}`).set('Authorization', auth).expect(200);
    expect(persisted.body).toMatchObject({ name: 'Apartamento sintético', version: 1 });
  });

  it('rejects a stale version without mutating and accepts the next write with the current version', async () => {
    const { property, auth } = await seed();
    await put(property.id, replaceFrom(property as never, { version: 1, name: 'Uno' }), auth).expect(200);
    await put(property.id, replaceFrom(property as never, { version: 1, name: 'Dos' }), auth).expect(409);
    const res = await put(property.id, replaceFrom(property as never, { version: 2, name: 'Dos' }), auth).expect(200);
    expect(res.body).toMatchObject({ name: 'Dos', version: 3 });
  });
});
