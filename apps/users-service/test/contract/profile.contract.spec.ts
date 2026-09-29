import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { userToken } from '../fixtures/users.fixture';
import { activeFixture, png } from '../fixtures/profile.fixture';
describe('USR-045 profile provider contract', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it('GET/PATCH/photo return sanitized JSON and binary', async () => {
    const id = await activeFixture(h); const path = `/internal/v1/users/${id}/profile`; const auth = `Bearer ${userToken(id)}`;
    const original = await request(h.server).get(path).set('Authorization', auth).expect(200);
    expect(Object.keys(original.body as object).sort()).toEqual(['id', 'name', 'email', 'role', 'phone', 'preferences', 'photoUrl', 'version'].sort());
    const updated = await request(h.server).patch(path).set('Authorization', auth).field('profile', JSON.stringify({ expectedVersion: 1, name: 'Changed Name' })).attach('photo', png, { filename: 'ignored.png', contentType: 'image/png' }).expect(200);
    expect(updated.body as unknown).toMatchObject({ version: 2, name: 'Changed Name' });
    const photo = await request(h.server).get(`${path}/photo`).set('Authorization', auth).expect(200).expect('Content-Type', /image\/png/);
    expect(photo.body as unknown).toEqual(png); expect(photo.headers.etag as unknown).toMatch(/^"[0-9a-f]{64}"$/);
  });
  it('preserves 401/403/404 precedence', async () => {
    const id = await activeFixture(h); const path = `/internal/v1/users/${id}/profile`;
    await request(h.server).get(path).expect(401);
    await request(h.server).get(path).set('Authorization', `Bearer ${userToken('a0000000-0000-4000-8000-000000000001')}`).expect(403);
    await request(h.server).get(`${path}/photo`).set('Authorization', `Bearer ${userToken(id)}`).expect(404);
  });
  it.each([
    [{ expectedVersion: 1, role: 'ADMIN' }, undefined, 400, 'VALIDATION_ERROR'],
    [{ expectedVersion: 2, name: 'Stale Name' }, undefined, 409, 'VERSION_CONFLICT'],
    [{ expectedVersion: 1 }, Buffer.alloc(5_000_001), 413, 'HTTP_413'],
    [{ expectedVersion: 1 }, Buffer.from('not PNG'), 415, 'PHOTO_MEDIA_TYPE'],
  ] as const)('returns safe Problem Details for patch %p', async (body, photo, status, code) => {
    const id = await activeFixture(h);
    const before = await h.db.user.findUniqueOrThrow({ where: { id } });
    const call = request(h.server).patch(`/internal/v1/users/${id}/profile`)
      .set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify(body));
    if (photo) call.attach('photo', photo, { filename: 'ignored.png', contentType: 'image/png' });
    const response = await call.expect(status).expect('Content-Type', /application\/problem\+json/);
    expect(response.body as unknown).toMatchObject({ status, code, type: 'about:blank', errors: expect.any(Array) });
    expect(Object.keys(response.body as object).sort()).toEqual(['type', 'title', 'status', 'detail', 'instance', 'code', 'traceId', 'errors'].sort());
    expect(await h.db.user.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
});
