import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { createBody, jpeg, png, webp } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';
import { documentedStatuses, expectContract } from './openapi-contract';

describe('ACC-029 POST /properties/{id}/photos contract (addPropertyPhoto)', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(sub = randomUUID()): Promise<{ id: string; auth: string }> {
    const auth = bearer(sub);
    const res = await request(h.server).post('/properties').set('Authorization', auth).send(createBody()).expect(201);
    return { id: (res.body as { id: string }).id, auth };
  }
  const post = (id: string, auth?: string): request.Test => {
    const req = request(h.server).post(`/properties/${id}/photos`);
    return auth ? req.set('Authorization', auth) : req;
  };

  it('documents 201/400/401/403/404/409/413/415/503 and no photo URL', () => {
    expect(documentedStatuses('addPropertyPhoto').sort()).toEqual([201, 400, 401, 403, 404, 409, 413, 415, 503]);
  });

  it.each([
    ['png', png, 'image/png'],
    ['jpeg', jpeg, 'image/jpeg'],
    ['webp', webp, 'image/webp'],
  ] as const)('returns 201 Photo metadata for a %s without a URL', async (_name, content, mediaType) => {
    const { id, auth } = await seed();
    const res = await post(id, auth).attach('file', content, { filename: `a.${_name}`, contentType: mediaType });
    expectContract(res, 'addPropertyPhoto');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mediaType, byteSize: content.length, position: 0 });
    expect(res.body).not.toHaveProperty('url');
    expect(res.body).not.toHaveProperty('storageKey');
  });

  it('returns 400 VALIDATION_ERROR on file when the file part is missing', async () => {
    const { id, auth } = await seed();
    const res = await post(id, auth).field('note', 'no-file');
    expectContract(res, 'addPropertyPhoto');
    expect(res.body).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', errors: [{ field: 'file', code: 'INVALID_VALUE' }] });
  });

  it('returns 401 without bearer and 403 for GUEST', async () => {
    const { id } = await seed();
    const unauth = await post(id).attach('file', png, 'a.png');
    const forbidden = await post(id, bearer(undefined, 'GUEST')).attach('file', png, 'a.png');
    expectContract(unauth, 'addPropertyPhoto');
    expectContract(forbidden, 'addPropertyPhoto');
    expect(unauth.status).toBe(401);
    expect(forbidden.body).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('returns 404 for a foreign owner', async () => {
    const { id } = await seed();
    const res = await post(id, bearer(randomUUID())).attach('file', png, 'a.png');
    expectContract(res, 'addPropertyPhoto');
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
