import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '../../src/application/ports/property.repository';
import type { PropertyStatus } from '../../src/domain/properties/property.types';
import { newProperty } from '../fixtures/accommodations.fixture';
import { bearer, forgeToken, validClaims, validHeader } from '../fixtures/config.fixture';
import { contract, documentedStatuses, expectContract } from './openapi-contract';

describe('ACC-020 GET /properties/{id} contract (getProperty)', () => {
  let h: Harness; let repo: PropertyRepository;
  const ownerId = randomUUID();
  beforeAll(async () => { h = await postgresHarness(); repo = h.app.get<PropertyRepository>(PROPERTY_REPOSITORY); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(status: PropertyStatus, photos = 0): Promise<string> {
    const { id } = await repo.create(newProperty(ownerId));
    await h.db.property.update({ where: { id }, data: { status } });
    for (let position = 0; position < photos; position += 1) {
      await h.db.photo.create({ data: { id: randomUUID(), propertyId: id, storageKey: randomUUID().replace(/-/g, ''), mediaType: 'image/png', byteSize: 10 + position, position } });
    }
    return id;
  }
  const get = (id: string, authorization?: string): request.Test => {
    const req = request(h.server).get(`/properties/${id}`);
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };
  const stable = (body: unknown): unknown => ({ ...(body as object), traceId: undefined, instance: undefined });

  it('documents 200/400/401/404/503 and optional bearer security', () => {
    expect(documentedStatuses('getProperty').sort()).toEqual([200, 400, 401, 404, 503]);
    expect((contract.paths['/properties/{id}']?.get as { security: unknown[] }).security).toEqual([{ bearerAuth: [] }, {}]);
  });

  it('returns a PUBLISHED Property to anonymous callers without ownerId or storage internals', async () => {
    const id = await seed('PUBLISHED', 2);
    const res = await get(id);
    expectContract(res, 'getProperty');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('ownerId');
    expect((res.body as { photos: object[] }).photos.map((photo) => Object.keys(photo).sort())).toEqual([
      ['byteSize', 'createdAt', 'id', 'mediaType', 'position'], ['byteSize', 'createdAt', 'id', 'mediaType', 'position'],
    ]);
  });

  it.each(['DRAFT', 'UNPUBLISHED'] as PropertyStatus[])('returns a %s Property with ownerId to its OWNER', async (status) => {
    const id = await seed(status);
    const res = await get(id, bearer(ownerId));
    expectContract(res, 'getProperty');
    expect(res.body).toMatchObject({ id, status, ownerId });
  });

  it('returns indistinguishable 404 Problems for a hidden and a nonexistent property', async () => {
    const hidden = await get(await seed('DRAFT'), bearer(randomUUID()));
    const missing = await get(randomUUID(), bearer(randomUUID()));
    for (const res of [hidden, missing]) {
      expectContract(res, 'getProperty');
      expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND', errors: [] });
    }
    expect(stable(hidden.body)).toEqual(stable(missing.body));
  });

  it.each(['not-a-uuid', '123', `${randomUUID()}x`])('returns 400 VALIDATION_ERROR on id for %s', async (id) => {
    const res = await get(id);
    expectContract(res, 'getProperty');
    expect(res.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', errors: [{ field: 'id', code: 'INVALID_VALUE' }] });
  });

  it('returns 401 Problem for an invalid bearer on a PUBLISHED property', async () => {
    const res = await get(await seed('PUBLISHED'), `Bearer ${forgeToken(validHeader({ kid: 'other' }), validClaims())}`);
    expectContract(res, 'getProperty');
    expect(res.status).toBe(401);
  });
});
