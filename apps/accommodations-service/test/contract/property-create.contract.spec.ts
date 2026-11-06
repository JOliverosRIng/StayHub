import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { createBody } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';
import { documentedStatuses, expectContract, requestSchema, validate } from './openapi-contract';

describe('ACC-016 POST /properties contract (createProperty)', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  const post = (body: unknown, authorization?: string): request.Test => {
    const req = request(h.server).post('/properties');
    if (authorization !== undefined) req.set('Authorization', authorization);
    return req.send(body as object);
  };

  it('documents exactly 201/400/401/403/503 and no 409', () => {
    expect(documentedStatuses('createProperty').sort()).toEqual([201, 400, 401, 403, 503]);
  });

  it('uses fixtures that satisfy PropertyCreate', () => {
    expect(validate(requestSchema('createProperty'), createBody())).toEqual([]);
  });

  it('returns 201 with a Property in DRAFT, version 1 and the creator as ownerId', async () => {
    const sub = randomUUID();
    const res = await post(createBody(), bearer(sub));
    expectContract(res, 'createProperty');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ownerId: sub, status: 'DRAFT', version: 1, photos: [] });
  });

  it('returns 201 for the minimal body, with null description and basePrice and no features', async () => {
    const body = { type: 'HOUSE', name: 'C', location: { addressLine: 'A', city: 'B', region: 'C', country: 'CO' }, rooms: [{ name: 'R', capacity: 1 }] };
    expect(validate(requestSchema('createProperty'), body)).toEqual([]);
    const res = await post(body, bearer());
    expectContract(res, 'createProperty');
    expect(res.body).toMatchObject({ description: null, features: [], location: body.location, rooms: [{ name: 'R', capacity: 1, basePrice: null }] });
  });

  it('has no 409: identical bodies create distinct resources', async () => {
    const auth = bearer();
    const first = await post(createBody(), auth).expect(201);
    const second = await post(createBody(), auth).expect(201);
    expect((second.body as { id: string }).id).not.toBe((first.body as { id: string }).id);
  });

  it.each([
    ['missing rooms', { ...createBody(), rooms: undefined }],
    ['empty rooms', createBody({ rooms: [] })],
    ['client-supplied ownerId', { ...createBody(), ownerId: randomUUID() }],
    ['client-supplied status', { ...createBody(), status: 'PUBLISHED' }],
    ['client-supplied version', { ...createBody(), version: 3 }],
    ['invalid country', createBody({ location: { addressLine: 'A', city: 'B', region: 'C', country: 'co' } })],
    ['zero price', createBody({ rooms: [{ name: 'R', capacity: 1, basePrice: { amount: '0.00', currency: 'COP' } }] })],
    ['duplicated featureCodes', createBody({ featureCodes: ['WIFI', 'WIFI'] })],
    ['unknown featureCode', createBody({ featureCodes: ['TELEPORTER'] })],
  ])('returns 400 VALIDATION_ERROR Problem for %s', async (_case, body) => {
    expect(validate(requestSchema('createProperty'), body).length > 0 || _case === 'unknown featureCode').toBe(true);
    const res = await post(body, bearer());
    expectContract(res, 'createProperty');
    expect(res.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('returns 400 VALIDATION_ERROR for a malformed JSON body', async () => {
    const res = await request(h.server).post('/properties').set('Authorization', bearer()).set('Content-Type', 'application/json').send('{"type":');
    expectContract(res, 'createProperty');
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'body', code: 'INVALID_VALUE' }] });
  });

  it('returns 401 Problem without bearer', async () => {
    const res = await post(createBody());
    expectContract(res, 'createProperty');
    expect(res.status).toBe(401);
  });

  it('returns 403 Problem for a non-OWNER role', async () => {
    const res = await post(createBody(), bearer(undefined, 'GUEST'));
    expectContract(res, 'createProperty');
    expect(res.body).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
