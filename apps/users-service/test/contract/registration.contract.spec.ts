import { randomUUID } from 'node:crypto';
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
  it('reads the exact summary for PENDING, ACTIVE and CANCELLED states', async () => {
    const auth = `Bearer ${serviceToken()}`;
    const pending = pendingFixture();
    await request(h.server).post('/internal/v1/registrations').set('Authorization', auth).send(pending).expect(201);
    const pendingRead = await request(h.server).get(`/internal/v1/registrations/${pending.registrationId}`).set('Authorization', auth).expect(200);
    expect(pendingRead.body as unknown).toEqual({ id: pending.userId, name: pending.name, email: pending.email, role: 'GUEST', status: 'PENDING' });
    await request(h.server).post(`/internal/v1/registrations/${pending.registrationId}/activate`).set('Authorization', auth).expect(200);
    const activeRead = await request(h.server).get(`/internal/v1/registrations/${pending.registrationId}`).set('Authorization', auth).expect(200);
    expect(activeRead.body as unknown).toEqual({ id: pending.userId, name: pending.name, email: pending.email, role: 'GUEST', status: 'ACTIVE' });
    const cancelled = pendingFixture();
    await request(h.server).post('/internal/v1/registrations').set('Authorization', auth).send(cancelled).expect(201);
    await request(h.server).post(`/internal/v1/registrations/${cancelled.registrationId}/cancel`).set('Authorization', auth).expect(204);
    const cancelledRead = await request(h.server).get(`/internal/v1/registrations/${cancelled.registrationId}`).set('Authorization', auth).expect(200);
    expect(cancelledRead.body as unknown).toEqual({ id: cancelled.userId, name: cancelled.name, email: cancelled.email, role: 'GUEST', status: 'CANCELLED' });
  });
  it('distinguishes an unknown registration 404 from a malformed identifier 400', async () => {
    const auth = `Bearer ${serviceToken()}`;
    await request(h.server).get(`/internal/v1/registrations/${randomUUID()}`).set('Authorization', auth).expect(404);
    await request(h.server).get('/internal/v1/registrations/not-a-uuid').set('Authorization', auth).expect(400);
  });
  it('does not alter persisted state across repeated reads', async () => {
    const auth = `Bearer ${serviceToken()}`;
    const body = pendingFixture();
    await request(h.server).post('/internal/v1/registrations').set('Authorization', auth).send(body).expect(201);
    const before = await h.db.user.findUniqueOrThrow({ where: { registrationId: body.registrationId } });
    const first = await request(h.server).get(`/internal/v1/registrations/${body.registrationId}`).set('Authorization', auth).expect(200);
    const second = await request(h.server).get(`/internal/v1/registrations/${body.registrationId}`).set('Authorization', auth).expect(200);
    expect(second.body as unknown).toEqual(first.body as unknown);
    expect(await h.db.user.findUniqueOrThrow({ where: { registrationId: body.registrationId } })).toEqual(before);
  });
});
