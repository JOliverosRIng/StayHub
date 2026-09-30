import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { pendingFixture, userToken } from '../fixtures/users.fixture';
import { activeFixture } from '../fixtures/profile.fixture';
describe('USR-063 cross-user non-disclosure before lookup', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { jest.restoreAllMocks(); await h.reset(); });
  it.each(['GUEST', 'OWNER', 'ADMIN'] as const)('%s cannot access existing or missing foreign identity', async (role) => {
    const own = await activeFixture(h, role); const other = await activeFixture(h); const find = jest.spyOn(h.db.user, 'findFirst'); const update = jest.spyOn(h.db.user, 'updateMany');
    for (const target of [other, pendingFixture().userId]) {
      const path = `/internal/v1/users/${target}/profile`; const auth = `Bearer ${userToken(own, { role })}`;
      await request(h.server).get(path).set('Authorization', auth).expect(403);
      await request(h.server).get(`${path}/photo`).set('Authorization', auth).expect(403);
      await request(h.server).patch(path).set('Authorization', auth).field('profile', 'malformed').expect(403);
    }
    expect(find).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
});
