import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '../../src/application/ports/property.repository';
import type { PropertyStatus } from '../../src/domain/properties/property.types';
import { newProperty } from '../fixtures/accommodations.fixture';
import { bearer, forgeToken, validClaims, validHeader } from '../fixtures/config.fixture';

jest.setTimeout(60_000);

describe('ACC-015 optional bearer on GET /properties/{id}', () => {
  let h: Harness; let repo: PropertyRepository;
  const ownerId = randomUUID();
  beforeAll(async () => { h = await postgresHarness(); repo = h.app.get<PropertyRepository>(PROPERTY_REPOSITORY); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(status: PropertyStatus): Promise<string> {
    const { id } = await repo.create(newProperty(ownerId));
    if (status !== 'DRAFT') await h.db.property.update({ where: { id }, data: { status } });
    return id;
  }
  const get = (id: string, authorization?: string): request.Test => {
    const req = request(h.server).get(`/properties/${id}`);
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };

  it('serves a PUBLISHED property anonymously without ownerId', async () => {
    const id = await seed('PUBLISHED');
    const res = await get(id).expect(200);
    expect(res.body).toMatchObject({ id, status: 'PUBLISHED' });
    expect(res.body).not.toHaveProperty('ownerId');
  });

  it('serves a PUBLISHED property to an authenticated non-owner without ownerId', async () => {
    const id = await seed('PUBLISHED');
    const res = await get(id, bearer(randomUUID(), 'GUEST')).expect(200);
    expect(res.body).not.toHaveProperty('ownerId');
  });

  it('includes ownerId for the owner of a PUBLISHED property', async () => {
    const id = await seed('PUBLISHED');
    const res = await get(id, bearer(ownerId, 'OWNER')).expect(200);
    expect(res.body).toMatchObject({ ownerId });
  });

  it.each([
    ['signed by a foreign key', (): string => `Bearer ${forgeToken(validHeader(), validClaims(), 'foreign-key')}`],
    ['expired', (): string => `Bearer ${forgeToken(validHeader(), validClaims({ iat: Math.floor(Date.now() / 1000) - 120, exp: Math.floor(Date.now() / 1000) - 1 }))}`],
    ['non-bearer scheme', (): string => 'Basic dXNlcjpwYXNz'],
    ['empty bearer', (): string => 'Bearer '],
  ])('rejects an invalid bearer (%s) with 401 even on a PUBLISHED property', async (_case, authorization) => {
    const id = await seed('PUBLISHED');
    const res = await get(id, authorization()).expect(401).expect('Content-Type', /application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, code: 'HTTP_401' });
  });

  it.each(['DRAFT', 'UNPUBLISHED'] as PropertyStatus[])('serves a %s property to its OWNER with ownerId', async (status) => {
    const id = await seed(status);
    const res = await get(id, bearer(ownerId, 'OWNER')).expect(200);
    expect(res.body).toMatchObject({ id, status, ownerId });
  });

  it.each(['DRAFT', 'UNPUBLISHED'] as PropertyStatus[])('hides a %s property with 404 from anonymous callers, other owners and non-OWNER roles of the same sub', async (status) => {
    const id = await seed(status);
    for (const authorization of [undefined, bearer(randomUUID(), 'OWNER'), bearer(ownerId, 'GUEST'), bearer(ownerId, 'ADMIN')]) {
      const res = await get(id, authorization).expect(404);
      expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    }
  });
});
