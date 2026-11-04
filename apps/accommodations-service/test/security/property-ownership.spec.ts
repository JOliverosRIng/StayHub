import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { createBody, replaceFrom } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';

jest.setTimeout(60_000);

describe('ACC-025 PUT ownership', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(sub = randomUUID()): Promise<{ id: string; body: object; auth: string; sub: string }> {
    const auth = bearer(sub);
    const res = await request(h.server).post('/properties').set('Authorization', auth).send(createBody()).expect(201);
    return { id: (res.body as { id: string }).id, body: replaceFrom(res.body as never), auth, sub };
  }

  it('does not distinguish a foreign owner from a missing id', async () => {
    const { id, body } = await seed();
    const stranger = bearer(randomUUID());
    const foreign = await request(h.server).put(`/properties/${id}`).set('Authorization', stranger).send(body).expect(404);
    const missing = await request(h.server).put(`/properties/${randomUUID()}`).set('Authorization', stranger).send(body).expect(404);
    expect({ ...(foreign.body as object), traceId: 0, instance: 0 }).toEqual({ ...(missing.body as object), traceId: 0, instance: 0 });
  });

  it('does not mutate a foreign property', async () => {
    const { id, body, auth } = await seed();
    await request(h.server).put(`/properties/${id}`).set('Authorization', bearer(randomUUID())).send({ ...body, name: 'Hacked' }).expect(404);
    const res = await request(h.server).get(`/properties/${id}`).set('Authorization', auth).expect(200);
    expect(res.body).toMatchObject({ name: 'Apartamento sintético', version: 1 });
  });

  it.each(['GUEST', 'ADMIN'] as const)('forbids %s before looking up the property', async (role) => {
    await request(h.server).put(`/properties/${randomUUID()}`).set('Authorization', bearer(undefined, role)).send(createBody()).expect(403);
  });
});
