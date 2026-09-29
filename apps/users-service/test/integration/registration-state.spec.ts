import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { pendingFixture, serviceToken } from '../fixtures/users.fixture';
describe('USR-025 registration state/atomicity', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it('rejects changed replay and reactivation of CANCELLED', async () => {
    const body = pendingFixture(); const auth = `Bearer ${serviceToken()}`;
    await request(h.server).post('/internal/v1/registrations').set('Authorization', auth).send(body).expect(201);
    await request(h.server).post('/internal/v1/registrations').set('Authorization', auth).send({ ...body, name: 'Other Name' }).expect(409);
    await request(h.server).post(`/internal/v1/registrations/${body.registrationId}/cancel`).set('Authorization', auth).expect(204);
    await request(h.server).post(`/internal/v1/registrations/${body.registrationId}/activate`).set('Authorization', auth).expect(409);
    expect((await h.db.user.findUniqueOrThrow({ where: { id: body.userId } })).status).toBe('CANCELLED');
  });
});
