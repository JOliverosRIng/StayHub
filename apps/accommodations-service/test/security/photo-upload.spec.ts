import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { createBody, jpeg, png } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';
import { MAX_PHOTO_BYTES } from '../../src/domain/photos/photo.policy';

jest.setTimeout(60_000);

describe('ACC-030 photo upload authorization and content checks', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(sub = randomUUID()): Promise<{ id: string; auth: string }> {
    const auth = bearer(sub);
    const res = await request(h.server).post('/properties').set('Authorization', auth).send(createBody()).expect(201);
    return { id: (res.body as { id: string }).id, auth };
  }

  it('trusts magic bytes over the declared Content-Type', async () => {
    const { id, auth } = await seed();
    const res = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth)
      .attach('file', jpeg, { filename: 'spoof.png', contentType: 'image/png' }).expect(201);
    expect(res.body).toMatchObject({ mediaType: 'image/jpeg' });
  });

  it('rejects a GIF as 415 PHOTO_MEDIA_TYPE', async () => {
    const { id, auth } = await seed();
    const res = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth)
      .attach('file', Buffer.from('GIF89a............'), { filename: 'a.gif', contentType: 'image/gif' }).expect(415);
    expect(res.body).toMatchObject({ code: 'PHOTO_MEDIA_TYPE' });
  });

  it('rejects an oversized JPEG as 413 PHOTO_TOO_LARGE', async () => {
    const { id, auth } = await seed();
    const huge = Buffer.concat([jpeg, Buffer.alloc(MAX_PHOTO_BYTES)]);
    const res = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth)
      .attach('file', huge, { filename: 'huge.jpg', contentType: 'image/jpeg' }).expect(413);
    expect(res.body).toMatchObject({ code: 'PHOTO_TOO_LARGE' });
  });

  it('does not store a photo for a foreign property', async () => {
    const { id, auth } = await seed();
    await request(h.server).post(`/properties/${id}/photos`).set('Authorization', bearer(randomUUID()))
      .attach('file', png, 'a.png').expect(404);
    const res = await request(h.server).get(`/properties/${id}`).set('Authorization', auth).expect(200);
    expect((res.body as { photos: unknown[] }).photos).toEqual([]);
  });
});
