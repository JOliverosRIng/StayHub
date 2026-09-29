import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { userToken } from '../fixtures/users.fixture';
import { activeFixture } from '../fixtures/profile.fixture';
describe('USR-064 mass assignment', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it.each(['role', 'id', 'userId', 'status', 'registrationId', 'credential', 'version', 'unknown'])('rejects %s without mutation', async (field) => {
    const id = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } });
    await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1, name: 'Must Rollback', [field]: 'injected' })).expect(400);
    expect(await h.db.user.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
});
