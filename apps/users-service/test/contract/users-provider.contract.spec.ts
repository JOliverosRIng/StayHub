import request from 'supertest';
import { consumerHandoffFixture } from '../fixtures/consumer-handoff.fixture';
import { serviceToken, userToken } from '../fixtures/users.fixture';
import { postgresHarness, type Harness } from '../integration/postgres.setup';

// Direct Users provider evidence. This does not instantiate Auth or Gateway.
describe('Users provider handoff', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterEach(async () => { await h.reset(); });
  afterAll(async () => { await h.close(); });

  it('preserves identity across replay, activation and email change; lookup follows current email', async () => {
    const { registration, changedEmail, paths } = consumerHandoffFixture();
    const registrationAuth = `Bearer ${serviceToken()}`;
    const lookupAuth = `Bearer ${serviceToken('users:login-identity')}`;
    const ownerAuth = `Bearer ${userToken(registration.userId)}`;
    for (let replay = 0; replay < 2; replay += 1) {
      const created = await request(h.server).post(paths.registration).set('Authorization', registrationAuth).send(registration).expect(201);
      expect(created.body).toMatchObject({ id: registration.userId, status: 'PENDING' });
    }
    await request(h.server).post(paths.lookup).set('Authorization', lookupAuth).send({ email: registration.email }).expect(404);
    for (let replay = 0; replay < 2; replay += 1) {
      await request(h.server).post(paths.activate).set('Authorization', registrationAuth).expect(200);
    }
    const before = await request(h.server).get(paths.profile).set('Authorization', ownerAuth).expect(200);
    expect(before.body).toMatchObject({ id: registration.userId, version: 1 });
    await request(h.server).patch(paths.profile).set('Authorization', ownerAuth).field('profile', JSON.stringify({ expectedVersion: 1, email: changedEmail })).expect(200);
    await request(h.server).post(paths.lookup).set('Authorization', lookupAuth).send({ email: registration.email }).expect(404);
    const identity = await request(h.server).post(paths.lookup).set('Authorization', lookupAuth).send({ email: changedEmail }).expect(200);
    expect(identity.body).toEqual({ userId: registration.userId, role: 'GUEST', status: 'ACTIVE' });
    await request(h.server).patch(paths.profile).set('Authorization', ownerAuth).field('profile', JSON.stringify({ expectedVersion: 1, name: 'Stale Consumer' })).expect(409);
    await request(h.server).post(paths.cancel).set('Authorization', registrationAuth).expect(409);
  });

  it('allows cancellation replay but never exposes a cancelled identity to lookup', async () => {
    const { registration, paths } = consumerHandoffFixture();
    const authorization = `Bearer ${serviceToken()}`;
    await request(h.server).post(paths.registration).set('Authorization', authorization).send(registration).expect(201);
    for (let replay = 0; replay < 2; replay += 1) {
      await request(h.server).post(paths.cancel).set('Authorization', authorization).expect(204);
    }
    await request(h.server).post(paths.lookup).set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email: registration.email }).expect(404);
    await request(h.server).post(paths.activate).set('Authorization', authorization).expect(409);
  });
});
