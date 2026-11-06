import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { createBody, png } from '../fixtures/accommodations.fixture';
import { bearer } from '../fixtures/config.fixture';
import { MAX_PHOTOS_PER_PROPERTY } from '../../src/domain/photos/photo.policy';

describe('ACC-030/032 photo persistence', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(sub = randomUUID()): Promise<{ id: string; auth: string }> {
    const auth = bearer(sub);
    const res = await request(h.server).post('/properties').set('Authorization', auth).send(createBody()).expect(201);
    return { id: (res.body as { id: string }).id, auth };
  }

  it('stores bytes on disk, metadata in PostgreSQL, and does not increment version', async () => {
    const { id, auth } = await seed();
    const first = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth).attach('file', png, 'a.png').expect(201);
    const second = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth).attach('file', png, 'b.png').expect(201);
    expect(first.body).toMatchObject({ position: 0 });
    expect(second.body).toMatchObject({ position: 1 });
    const row = await h.db.property.findUniqueOrThrow({ where: { id }, include: { photos: { orderBy: { position: 'asc' } } } });
    expect(row.version).toBe(1);
    expect(row.photos).toHaveLength(2);
    expect(await readdir(h.config.photoStorageRoot)).toEqual(expect.arrayContaining(row.photos.map((photo) => photo.storageKey)));
    const view = await request(h.server).get(`/properties/${id}`).set('Authorization', auth).expect(200);
    expect(view.body).toMatchObject({ version: 1, photos: [{ position: 0 }, { position: 1 }] });
    expect(JSON.stringify(view.body)).not.toMatch(/storageKey|photoStorageRoot/);
  });

  it('rejects the eleventh photo with PHOTO_LIMIT_REACHED and does not write a new object', async () => {
    const { id, auth } = await seed();
    for (let i = 0; i < MAX_PHOTOS_PER_PROPERTY; i += 1) {
      await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth).attach('file', png, `p${String(i)}.png`).expect(201);
    }
    const before = await readdir(h.config.photoStorageRoot);
    const res = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth).attach('file', png, 'overflow.png').expect(409);
    expect(res.body).toMatchObject({ code: 'PHOTO_LIMIT_REACHED' });
    expect(await h.db.photo.count({ where: { propertyId: id } })).toBe(MAX_PHOTOS_PER_PROPERTY);
    expect(await readdir(h.config.photoStorageRoot)).toEqual(before);
  });

  it('rejects an empty file as VALIDATION_ERROR on file without persisting', async () => {
    const { id, auth } = await seed();
    const res = await request(h.server).post(`/properties/${id}/photos`).set('Authorization', auth)
      .attach('file', Buffer.alloc(0), { filename: 'empty.png', contentType: 'image/png' }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'file', code: 'INVALID_VALUE' }] });
    expect(await h.db.photo.count()).toBe(0);
  });
});
