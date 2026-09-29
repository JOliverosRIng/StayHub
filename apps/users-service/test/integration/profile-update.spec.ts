import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { userToken, serviceToken } from '../fixtures/users.fixture';
import { activeFixture } from '../fixtures/profile.fixture';
describe('USR-047 optimistic atomic profile update', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it('one concurrent version wins; stale request changes nothing', async () => {
    const id = await activeFixture(h); const call = (name: string): request.Test => request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1, name }));
    const results = await Promise.all([call('First Name'), call('Second Name')]); expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body as unknown).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await h.db.user.findUniqueOrThrow({ where: { id } })).version).toBe(2);
  });
  it('duplicate email rolls back other fields and version', async () => {
    const id = await activeFixture(h); const other = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } }); const target = await h.db.user.findUniqueOrThrow({ where: { id: other } });
    const res = await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1, name: 'Must Rollback', email: target.email.toUpperCase() })).expect(409);
    expect(res.body as unknown).toMatchObject({ code: 'EMAIL_CONFLICT' }); expect(await h.db.user.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
  it('email change switches lookup immediately; null clears optionals', async () => {
    const id = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } });
    const patch = (body: object): request.Test => request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify(body));
    await patch({ expectedVersion: 1, email: 'new@example.test', phone: '+573001234567', preferences: { quiet: true } }).expect(200);
    const lookup = (email: string): request.Test => request(h.server).post('/internal/v1/login-identities/resolve').set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email });
    await lookup(before.email).expect(404); await lookup(' NEW@example.test ').expect(200);
    const res = await patch({ expectedVersion: 2, phone: null, preferences: null }).expect(200);
    expect(res.body as unknown).toMatchObject({ phone: null, preferences: null, version: 3 });
  });
});
