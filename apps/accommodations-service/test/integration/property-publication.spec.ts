import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { createBody, replaceFrom } from '../fixtures/accommodations.fixture';
import { insertTestPhoto } from '../fixtures/property-publication.fixture';
import { bearer } from '../fixtures/config.fixture';

describe('ACC-026 PUT publication transitions', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(sub = randomUUID()): Promise<{ id: string; auth: string; body: ReturnType<typeof replaceFrom> }> {
    const auth = bearer(sub);
    const res = await request(h.server).post('/properties').set('Authorization', auth).send(createBody()).expect(201);
    return { id: (res.body as { id: string }).id, auth, body: replaceFrom(res.body as never) };
  }
  const put = (id: string, body: unknown, auth: string): request.Test => request(h.server).put(`/properties/${id}`).set('Authorization', auth).send(body as object);

  it('publishes atomically when name, location, a priced room and a persisted photo are present', async () => {
    const { id, auth, body } = await seed();
    await insertTestPhoto(h, id);
    const res = await put(id, { ...body, status: 'PUBLISHED' }, auth).expect(200);
    expect(res.body).toMatchObject({ status: 'PUBLISHED', version: 2, photos: [{ position: 0, mediaType: 'image/png' }] });
    await request(h.server).get(`/properties/${id}`).expect(200);
  });

  it('rejects an incomplete publish without mutating name or status', async () => {
    const { id, auth, body } = await seed();
    const res = await put(id, { ...body, name: 'No publicar', status: 'PUBLISHED' }, auth).expect(409);
    expect(res.body).toMatchObject({ code: 'PUBLICATION_INCOMPLETE' });
    const persisted = await request(h.server).get(`/properties/${id}`).set('Authorization', auth).expect(200);
    expect(persisted.body).toMatchObject({ name: 'Apartamento sintético', status: 'DRAFT', version: 1 });
  });

  it('rejects PUBLISHED → DRAFT without mutating and allows UNPUBLISHED instead', async () => {
    const { id, auth, body } = await seed();
    await insertTestPhoto(h, id);
    await put(id, { ...body, status: 'PUBLISHED' }, auth).expect(200);
    await put(id, { ...body, version: 2, status: 'DRAFT' }, auth).expect(409);
    const unpublished = await put(id, { ...body, version: 2, status: 'UNPUBLISHED' }, auth).expect(200);
    expect(unpublished.body).toMatchObject({ status: 'UNPUBLISHED', version: 3 });
    await request(h.server).get(`/properties/${id}`).expect(404);
    await put(id, { ...body, version: 3, status: 'PUBLISHED' }, auth).expect(200);
  });

  it('rejects publishing when every room omits basePrice, even with a photo', async () => {
    const { id, auth, body } = await seed();
    await insertTestPhoto(h, id);
    const rooms = (body.rooms as { id: string; name: string; capacity: number }[]).map(({ id: roomId, name, capacity }) => ({ id: roomId, name, capacity }));
    await put(id, { ...body, rooms, status: 'PUBLISHED' }, auth).expect(409);
    expect((await request(h.server).get(`/properties/${id}`).set('Authorization', auth)).body).toMatchObject({ status: 'DRAFT', version: 1 });
  });
});
