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
