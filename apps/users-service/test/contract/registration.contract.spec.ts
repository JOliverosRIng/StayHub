import request from 'supertest';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { pendingFixture, serviceToken } from '../fixtures/users.fixture';
describe('USR-022 provider registration contract', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });
  it('creates/replays 201, activates/replays 200 with the specified projection', async () => {
    const command = pendingFixture(); const auth = `Bearer ${serviceToken()}`;
    for (let i = 0; i < 2; i++) {
      const response = await request(h.server).post('/internal/v1/registrations').set('Authorization', auth).send(command).expect(201);
      expect(response.body as unknown).toEqual({ id: command.userId, name: command.name, email: command.email, role: 'GUEST', status: 'PENDING' });
    }
    for (let i = 0; i < 2; i++) await request(h.server).post(`/internal/v1/registrations/${command.registrationId}/activate`).set('Authorization', auth).expect(200);
    await request(h.server).post(`/internal/v1/registrations/${command.registrationId}/cancel`).set('Authorization', auth).expect(409);
  });
  it('cancels and replays 204; absence is 404', async () => {
    const command = pendingFixture(); const auth = `Bearer ${serviceToken()}`;
    await request(h.server).post('/internal/v1/registrations').set('Authorization', auth).send(command).expect(201);
    for (let i = 0; i < 2; i++) await request(h.server).post(`/internal/v1/registrations/${command.registrationId}/cancel`).set('Authorization', auth).expect(204);
    await request(h.server).post(`/internal/v1/registrations/${pendingFixture().registrationId}/activate`).set('Authorization', auth).expect(404);
  });
  it.each([{ role: 'ADMIN' }, { password: 'synthetic' }, { name: null }, { userId: 'invalid' }, { email: 'invalid' }])('rejects invalid/unknown input %p', async (patch) => {
    await request(h.server).post('/internal/v1/registrations').set('Authorization', `Bearer ${serviceToken()}`).send({ ...pendingFixture(), ...patch }).expect(400);
    expect(await h.db.user.count()).toBe(0);
  });
});
