import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { pendingFixture, serviceToken } from '../fixtures/users.fixture';
describe('USR-024 PostgreSQL uniqueness/concurrency', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it('concurrent equivalent emails create exactly one identity', async () => {
    const a = pendingFixture(); const b = { ...pendingFixture(), email: ` ${a.email.toUpperCase()} ` };
    const results = await Promise.all([a, b].map((body) => request(h.server).post('/internal/v1/registrations').set('Authorization', `Bearer ${serviceToken()}`).send(body)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]); expect(await h.db.user.count()).toBe(1);
  });
  it('concurrent same registration replays one identity', async () => {
    const body = pendingFixture(); const results = await Promise.all([1, 2].map(() => request(h.server).post('/internal/v1/registrations').set('Authorization', `Bearer ${serviceToken()}`).send(body)));
    expect(results.map((r) => r.status)).toEqual([201, 201]); expect(await h.db.user.count()).toBe(1);
  });
});
