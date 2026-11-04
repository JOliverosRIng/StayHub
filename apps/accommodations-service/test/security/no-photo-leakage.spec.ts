import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { createBody, png } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';

jest.setTimeout(60_000);

describe('ACC-033 photo responses never leak storage internals', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  it('omits storageKey, filesystem paths and the storage root from 201 and GET bodies, including errors', async () => {
    const sub = randomUUID();
    const auth = bearer(sub);
    const created = await request(h.server).post('/properties').set('Authorization', auth).send(createBody()).expect(201);
    const id = (created.body as { id: string }).id;
    const uploaded = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth).attach('file', png, 'a.png').expect(201);
    const read = await request(h.server).get(`/properties/${id}`).set('Authorization', auth).expect(200);
    const forbidden = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', bearer(undefined, 'GUEST')).attach('file', png, 'a.png').expect(403);
    const leaked = [h.config.photoStorageRoot, 'storageKey', '/var/lib/stayhub'];
    for (const res of [uploaded, read, forbidden]) {
      const serialized = JSON.stringify(res.body);
      for (const secret of leaked) expect(serialized).not.toContain(secret);
    }
  });
});
