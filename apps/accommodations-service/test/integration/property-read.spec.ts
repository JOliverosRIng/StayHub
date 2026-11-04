import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '../../src/application/ports/property.repository';
import { newProperty } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';

describe('ACC-021 GET /properties/{id} read model', () => {
  let h: Harness; let repo: PropertyRepository;
  beforeAll(async () => { h = await postgresHarness(); repo = h.app.get<PropertyRepository>(PROPERTY_REPOSITORY); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  it('returns the full aggregate with sorted features and photos ordered by position', async () => {
    const ownerId = randomUUID();
    const input = newProperty(ownerId, { featureCodes: ['WIFI', 'AIR_CONDITIONING', 'POOL'] });
    const { id } = await repo.create(input);
    for (const position of [2, 0, 1]) {
      await h.db.photo.create({ data: { id: randomUUID(), propertyId: id, storageKey: randomUUID().replace(/-/g, ''), mediaType: 'image/webp', byteSize: 100 + position, position } });
    }
    const res = await request(h.server).get(`/properties/${id}`).set('Authorization', bearer(ownerId)).expect(200).expect('Cache-Control', 'no-store');
    const body = res.body as { features: { code: string }[]; photos: { position: number; byteSize: number }[]; rooms: unknown[] };
    expect(res.body).toMatchObject({ id, ownerId, type: 'APARTMENT', status: 'DRAFT', version: 1, description: input.description, location: input.location });
    expect(body.features.map((feature) => feature.code)).toEqual(['AIR_CONDITIONING', 'POOL', 'WIFI']);
    expect(body.photos.map((photo) => [photo.position, photo.byteSize])).toEqual([[0, 100], [1, 101], [2, 102]]);
    expect(body.rooms).toEqual(expect.arrayContaining(input.rooms));
  });

  it('returns 404 NOT_FOUND for an unknown id and 400 for a malformed one', async () => {
    await request(h.server).get(`/properties/${randomUUID()}`).expect(404);
    const res = await request(h.server).get('/properties/..%2Fetc').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'id', code: 'INVALID_VALUE' }] });
  });
});
