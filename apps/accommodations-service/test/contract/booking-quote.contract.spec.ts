import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '../../src/application/ports/property.repository';
import { newProperty } from '../fixtures/accommodations.fixture';
import { serviceToken } from '../fixtures/config.fixture';
import { documentedStatuses, expectContract } from './openapi-contract';

describe('booking quote provider contract (getBookingQuote)', () => {
  let h: Harness;
  let repo: PropertyRepository;
  const ownerId = randomUUID();

  beforeAll(async () => {
    h = await postgresHarness();
    repo = h.app.get<PropertyRepository>(PROPERTY_REPOSITORY);
  });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED'): Promise<{ propertyId: string; roomId: string; roomName: string }> {
    const property = newProperty(ownerId);
    const { id } = await repo.create(property);
    if (status !== 'DRAFT') await h.db.property.update({ where: { id }, data: { status } });
    return { propertyId: id, roomId: property.rooms[0]!.id, roomName: property.rooms[0]!.name };
  }

  const quote = (propertyId: string, roomId: string, guests: number, authorization?: string): request.Test => {
    const req = request(h.server).get(`/internal/v1/properties/${propertyId}/rooms/${roomId}/booking-quote?guests=${guests}`);
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };

  it('documents the internal route with service auth and a closed response', () => {
    expect(documentedStatuses('getBookingQuote').sort()).toEqual([200, 400, 401, 404, 409, 503]);
  });

  it('returns the authoritative published quote for Bookings', async () => {
    const seeded = await seed();
    const response = await quote(seeded.propertyId, seeded.roomId, 2, `Bearer ${serviceToken()}`);
    expectContract(response, 'getBookingQuote');
    expect(response.body).toMatchObject({
      propertyId: seeded.propertyId,
      roomId: seeded.roomId,
      ownerId,
      propertyName: 'Apartamento sintético',
      roomName: seeded.roomName,
      propertyStatus: 'PUBLISHED',
      capacity: 2,
      basePrice: { amount: '120000.00', currency: 'COP' },
      propertyVersion: 1,
    });
  });

  it('rejects missing, malformed or wrong-scope service tokens', async () => {
    const seeded = await seed();
    for (const authorization of [undefined, 'Bearer not-a-token', `Bearer ${serviceToken('stayhub-bookings-service', 'other:scope')}`]) {
      const response = await quote(seeded.propertyId, seeded.roomId, 1, authorization);
      expectContract(response, 'getBookingQuote');
      expect(response.status).toBe(401);
    }
  });

  it('hides unpublished or missing properties and unrelated rooms', async () => {
    const draft = await seed('DRAFT');
    const published = await seed();
    const cases: Array<[string, string]> = [
      [draft.propertyId, draft.roomId],
      [randomUUID(), randomUUID()],
      [published.propertyId, randomUUID()],
    ];
    for (const [propertyId, roomId] of cases) {
      const response = await quote(propertyId, roomId, 1, `Bearer ${serviceToken()}`);
      expectContract(response, 'getBookingQuote');
      expect(response.status).toBe(404);
    }
  });

  it('returns 409 for capacity or missing price and 400 for invalid guests', async () => {
    const seeded = await seed();
    await expect(quote(seeded.propertyId, seeded.roomId, 3, `Bearer ${serviceToken()}`)).resolves.toMatchObject({ status: 409 });
    await expect(quote(seeded.propertyId, seeded.roomId, 0, `Bearer ${serviceToken()}`)).resolves.toMatchObject({ status: 400 });
  });
});
