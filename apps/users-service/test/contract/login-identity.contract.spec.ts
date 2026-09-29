import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { pendingFixture, serviceToken } from '../fixtures/users.fixture';
describe('USR-038 login identity contract', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it('returns ACTIVE userId/role/status and rejects extra fields', async () => {
    const body = pendingFixture();
    await h.db.user.create({ data: { id: body.userId, registrationId: body.registrationId, name: body.name, email: body.email, emailNormalized: body.email, role: 'ADMIN', status: 'ACTIVE' } });
    const response = await request(h.server).post('/internal/v1/login-identities/resolve').set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email: body.email }).expect(200);
    expect(response.body as unknown).toEqual({ userId: body.userId, role: 'ADMIN', status: 'ACTIVE' });
    await request(h.server).post('/internal/v1/login-identities/resolve').set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email: body.email, password: 'synthetic' }).expect(400);
  });
  it('accepts a valid 254-character email and rejects 255 before lookup', async () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    expect(email).toHaveLength(254);
    const find = jest.spyOn(h.db.user, 'findFirst');
    try {
      const lookup = (value: string): request.Test => request(h.server).post('/internal/v1/login-identities/resolve')
        .set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email: value });
      await lookup(email).expect(404);
      expect(find).toHaveBeenCalledTimes(1);
      find.mockClear();
      await lookup(`${email}d`).expect(400);
      expect(find).not.toHaveBeenCalled();
    } finally { find.mockRestore(); }
  });
});
