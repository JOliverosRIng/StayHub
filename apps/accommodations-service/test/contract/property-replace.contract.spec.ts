import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { createBody, replaceFrom } from '../fixtures/accommodations.fixture';
import { insertTestPhoto } from '../fixtures/property-publication.fixture';
import { bearer } from '../fixtures/config.fixture';
import { documentedStatuses, expectContract, requestSchema, validate } from './openapi-contract';

describe('ACC-024 PUT /properties/{id} contract (replaceProperty)', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  const owner = (): { sub: string; auth: string } => { const sub = randomUUID(); return { sub, auth: bearer(sub) }; };
  const put = (id: string, body: unknown, authorization?: string): request.Test => {
    const req = request(h.server).put(`/properties/${id}`);
    if (authorization !== undefined) req.set('Authorization', authorization);
    return req.send(body as object);
  };
  async function created(auth: string): Promise<Record<string, unknown> & { id: string; rooms: { id: string }[] }> {
    const res = await request(h.server).post('/properties').set('Authorization', auth).send(createBody()).expect(201);
    return res.body as Record<string, unknown> & { id: string; rooms: { id: string }[] };
  }

  it('documents 200/400/401/403/404/409/503', () => {
    expect(documentedStatuses('replaceProperty').sort()).toEqual([200, 400, 401, 403, 404, 409, 503]);
    expect(validate(requestSchema('replaceProperty'), replaceFrom({
      type: 'APARTMENT', name: 'N', description: 'D', location: { addressLine: 'A', city: 'B', region: 'C', country: 'CO' },
      status: 'DRAFT', version: 1, features: [], rooms: [{ id: randomUUID(), name: 'R', capacity: 1, basePrice: null }],
    }))).toEqual([]);
  });

  it('returns 200 with version incremented and rooms replaced', async () => {
    const { auth } = owner();
    const property = await created(auth);
    const body = replaceFrom(property as never, { name: 'Renombrado', rooms: [{ name: 'Nueva', capacity: 3 }] });
    const res = await put(property.id, body, auth);
    expectContract(res, 'replaceProperty');
    expect(res.body).toMatchObject({ id: property.id, name: 'Renombrado', version: 2, rooms: [{ name: 'Nueva', capacity: 3, basePrice: null }] });
  });

  it('returns 409 VERSION_CONFLICT Problem when version is stale', async () => {
    const { auth } = owner();
    const property = await created(auth);
    const res = await put(property.id, replaceFrom(property as never, { version: 99 }), auth);
    expectContract(res, 'replaceProperty');
    expect(res.body).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });

  it('returns 400 VALIDATION_ERROR on rooms[i].id for an unknown room id', async () => {
    const { auth } = owner();
    const property = await created(auth);
    const res = await put(property.id, replaceFrom(property as never, { rooms: [{ id: randomUUID(), name: 'X', capacity: 1 }] }), auth);
    expectContract(res, 'replaceProperty');
    expect(res.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', errors: [{ field: 'rooms[0].id', code: 'INVALID_VALUE' }] });
  });

  it('returns 409 STATE_CONFLICT for PUBLISHED → DRAFT', async () => {
    const { sub, auth } = owner();
    const property = await created(auth);
    await insertTestPhoto(h, property.id);
    await put(property.id, replaceFrom(property as never, { status: 'PUBLISHED' }), auth).expect(200);
    const published = await request(h.server).get(`/properties/${property.id}`).set('Authorization', bearer(sub)).expect(200);
    const res = await put(property.id, replaceFrom(published.body as never, { status: 'DRAFT' }), auth);
    expectContract(res, 'replaceProperty');
    expect(res.body).toMatchObject({ status: 409, code: 'STATE_CONFLICT' });
  });

  it('returns 409 PUBLICATION_INCOMPLETE when publishing without a photo', async () => {
    const { auth } = owner();
    const property = await created(auth);
    const res = await put(property.id, replaceFrom(property as never, { status: 'PUBLISHED' }), auth);
    expectContract(res, 'replaceProperty');
    expect(res.body).toMatchObject({ status: 409, code: 'PUBLICATION_INCOMPLETE' });
  });

  it('returns 404 NOT_FOUND for a foreign owner and for a missing id', async () => {
    const { auth } = owner();
    const property = await created(auth);
    const foreign = await put(property.id, replaceFrom(property as never), bearer(randomUUID()));
    const missing = await put(randomUUID(), replaceFrom(property as never), auth);
    for (const res of [foreign, missing]) {
      expectContract(res, 'replaceProperty');
      expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    }
  });

  it('returns 401 without bearer and 403 for GUEST', async () => {
    const { auth } = owner();
    const property = await created(auth);
    const unauth = await put(property.id, replaceFrom(property as never));
    const forbidden = await put(property.id, replaceFrom(property as never), bearer(undefined, 'GUEST'));
    expectContract(unauth, 'replaceProperty');
    expectContract(forbidden, 'replaceProperty');
    expect(unauth.status).toBe(401);
    expect(forbidden.body).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
