import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { createBody } from '../fixtures/accommodations.fixture';
import { bearer, forgeToken, validClaims, validHeader } from '../fixtures/config.fixture';

jest.setTimeout(60_000);

describe('ACC-017 POST /properties authorization', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  const post = (body: unknown, authorization?: string): request.Test => {
    const req = request(h.server).post('/properties');
    if (authorization !== undefined) req.set('Authorization', authorization);
    return req.send(body as object);
  };
  const count = (): Promise<number> => h.db.property.count();

  it('requires a bearer and authenticates before validating the body', async () => {
    await post(createBody()).expect(401);
    await post({ invalid: true }).expect(401);
    await post(createBody(), `Bearer ${forgeToken(validHeader(), validClaims(), 'foreign-key')}`).expect(401);
    expect(await count()).toBe(0);
  });

  it.each(['GUEST', 'ADMIN'] as const)('forbids %s before validating the body', async (role) => {
    await post(createBody(), bearer(undefined, role)).expect(403);
    await post({ invalid: true }, bearer(undefined, role)).expect(403);
    expect(await count()).toBe(0);
  });

  it('derives ownerId from sub and rejects a spoofed ownerId without persisting', async () => {
    const sub = randomUUID();
    await post({ ...createBody(), ownerId: randomUUID() }, bearer(sub)).expect(400);
    expect(await count()).toBe(0);
    const res = await post(createBody(), bearer(sub)).expect(201);
    expect(res.body).toMatchObject({ ownerId: sub });
    expect(await h.db.property.findMany({ select: { ownerId: true } })).toEqual([{ ownerId: sub }]);
  });
});
