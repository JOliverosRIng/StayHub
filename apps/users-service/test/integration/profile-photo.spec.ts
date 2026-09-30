import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { userToken } from '../fixtures/users.fixture';
import { activeFixture, png, jpeg } from '../fixtures/profile.fixture';
describe('USR-048 photo boundaries and rollback', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it.each([[png, 'image/png'], [jpeg, 'image/jpeg']] as const)('accepts magic bytes with exact 5,000,000 byte boundary', async (signature, type) => {
    const id = await activeFixture(h); const content = Buffer.alloc(5_000_000); signature.copy(content);
    await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1 })).attach('photo', content, { filename: 'discard', contentType: type }).expect(200);
  });
  it('commits a valid maximum photo when PostgreSQL takes more than five seconds', async () => {
    const id = await activeFixture(h);
    const content = Buffer.alloc(5_000_000); png.copy(content);
    await h.db.$executeRawUnsafe(`CREATE FUNCTION delay_photo_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(6); RETURN NEW; END $$`);
    await h.db.$executeRawUnsafe(`CREATE TRIGGER delay_photo_write BEFORE INSERT ON "ProfilePhoto" FOR EACH ROW EXECUTE FUNCTION delay_photo_write()`);
    try {
      await request(h.server).patch(`/internal/v1/users/${id}/profile`)
        .set('Authorization', `Bearer ${userToken(id)}`)
        .field('profile', JSON.stringify({ expectedVersion: 1, name: 'Slow Photo' }))
        .attach('photo', content, { filename: 'discard', contentType: 'image/png' }).expect(200);
      const stored = await h.db.profilePhoto.findUniqueOrThrow({ where: { userId: id } });
      expect(Buffer.from(stored.content).equals(content)).toBe(true);
      expect(await h.db.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ version: 2, name: 'Slow Photo' });
    } finally {
      await h.db.$executeRawUnsafe(`DROP TRIGGER delay_photo_write ON "ProfilePhoto"`);
      await h.db.$executeRawUnsafe(`DROP FUNCTION delay_photo_write()`);
    }
  });
  it.each([[Buffer.alloc(5_000_001), 'image/png', 413], [Buffer.from('not an image'), 'image/png', 415], [png, 'image/jpeg', 415]] as const)('rejects invalid photo with rollback', async (content, type, status) => {
    const id = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } });
    await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1, name: 'Must Rollback' })).attach('photo', content, { filename: 'discard', contentType: type }).expect(status);
    expect(await h.db.user.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
  it('deletes with null and rejects file plus null', async () => {
    const id = await activeFixture(h); const path = `/internal/v1/users/${id}/profile`; const auth = `Bearer ${userToken(id)}`;
    await request(h.server).patch(path).set('Authorization', auth).field('profile', JSON.stringify({ expectedVersion: 1, photo: null })).attach('photo', png, { filename: 'x.png', contentType: 'image/png' }).expect(400);
    await request(h.server).patch(path).set('Authorization', auth).field('profile', JSON.stringify({ expectedVersion: 1 })).attach('photo', png, { filename: 'x.png', contentType: 'image/png' }).expect(200);
    await request(h.server).patch(path).set('Authorization', auth).field('profile', JSON.stringify({ expectedVersion: 2, photo: null })).expect(200);
    await request(h.server).get(`${path}/photo`).set('Authorization', auth).expect(404);
  });
});
