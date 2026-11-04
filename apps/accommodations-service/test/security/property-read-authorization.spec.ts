import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '../../src/application/ports/property.repository';
import type { PropertyStatus } from '../../src/domain/properties/property.types';
import { newProperty } from '../fixtures/accommodations.fixture';
import { bearer, token } from '../fixtures/config.fixture';

jest.setTimeout(60_000);

describe('ACC-021 GET /properties/{id} authorization', () => {
  let h: Harness; let repo: PropertyRepository;
  const ownerId = randomUUID();
  beforeAll(async () => { h = await postgresHarness(); repo = h.app.get<PropertyRepository>(PROPERTY_REPOSITORY); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(status: PropertyStatus): Promise<string> {
    const { id } = await repo.create(newProperty(ownerId));
    await h.db.property.update({ where: { id }, data: { status } });
    return id;
  }
  const get = (path: string, authorization?: string): request.Test => {
    const req = request(h.server).get(path);
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };

  it('authenticates before validating the id: invalid bearer with invalid id is 401', async () => {
    await get('/properties/not-a-uuid', 'Bearer invalid.token.value').expect(401);
  });

  it('does not reveal existence: foreign DRAFT and unknown ids give the same 404', async () => {
    const id = await seed('DRAFT');
    const stranger = bearer(randomUUID());
    const foreign = await get(`/properties/${id}`, stranger).expect(404);
    const unknown = await get(`/properties/${randomUUID()}`, stranger).expect(404);
    expect({ ...foreign.body as object, traceId: 0, instance: 0 }).toEqual({ ...unknown.body as object, traceId: 0, instance: 0 });
  });

  it('accepts an uppercase UUID path for the same resource', async () => {
    const id = await seed('PUBLISHED');
    const res = await get(`/properties/${id.toUpperCase()}`).expect(200);
    expect(res.body).toMatchObject({ id });
  });

  it('never leaks ownerId to ADMIN or GUEST, even with the owner sub', async () => {
    const id = await seed('PUBLISHED');
    for (const role of ['ADMIN', 'GUEST'] as const) {
      const res = await get(`/properties/${id}`, `Bearer ${token(ownerId, role)}`).expect(200);
      expect(res.body).not.toHaveProperty('ownerId');
    }
  });
});
