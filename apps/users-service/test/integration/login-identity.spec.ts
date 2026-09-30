import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { pendingFixture, serviceToken } from '../fixtures/users.fixture';
describe('USR-040 lookup uses current normalized email and active state', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it.each(['PENDING', 'CANCELLED'] as const)('excludes %s', async (status) => {
    const body = pendingFixture(); await h.db.user.create({ data: { id: body.userId, registrationId: body.registrationId, name: body.name, email: body.email, emailNormalized: body.email, role: body.role, status } });
    await request(h.server).post('/internal/v1/login-identities/resolve').set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email: body.email }).expect(404);
  });
  it('finds equivalent new email and rejects old email after a committed update', async () => {
    const body = pendingFixture(); await h.db.user.create({ data: { id: body.userId, registrationId: body.registrationId, name: body.name, email: body.email, emailNormalized: body.email, role: body.role, status: 'ACTIVE' } });
    await h.db.user.update({ where: { id: body.userId }, data: { email: 'new@example.test', emailNormalized: 'new@example.test' } });
    const call = (email: string): request.Test => request(h.server).post('/internal/v1/login-identities/resolve').set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email });
    await call(body.email).expect(404); await call(' NEW@example.test ').expect(200);
  });
});
