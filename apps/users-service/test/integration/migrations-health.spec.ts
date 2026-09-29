import request from 'supertest';
import { postgresHarness, withRollback, type Harness } from './postgres.setup';
import { activeFixture, png } from '../fixtures/profile.fixture';
import { pendingFixture } from '../fixtures/users.fixture';
describe('USR-018/020/028/050 migrations and database integrity', () => {
  let h: Harness; beforeAll(async () => { h = await postgresHarness(); }); afterAll(async () => { await h?.close(); }); afterEach(async () => { await h.reset(); });
  it('liveness is independent; readiness requires both applied migrations', async () => {
    await request(h.server).get('/health/live').expect(200); await request(h.server).get('/health/ready').expect(200);
    await h.db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NULL WHERE migration_name = '202609280002_add_profile_photo'`;
    try { await request(h.server).get('/health/live').expect(200); await request(h.server).get('/health/ready').expect(503); }
    finally { await h.db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = CURRENT_TIMESTAMP WHERE migration_name = '202609280002_add_profile_photo'`; }
  });
  it('rolls back test transaction and preserves database invariants', async () => {
    const fixture = pendingFixture();
    await withRollback(h.db, async (tx) => { await tx.user.create({ data: { id: fixture.userId, registrationId: fixture.registrationId, name: fixture.name, email: fixture.email, emailNormalized: fixture.email, role: 'GUEST' } }); expect(await tx.user.count()).toBe(1); });
    expect(await h.db.user.count()).toBe(0);
    const id = await activeFixture(h);
    await expect(h.db.user.update({ where: { id }, data: { name: 'x' } })).rejects.toThrow();
    await expect(h.db.user.update({ where: { id }, data: { version: 0 } })).rejects.toThrow();
    await expect(h.db.profilePhoto.create({ data: { userId: id, content: png, mediaType: 'image/png', byteSize: 1, sha256: 'a'.repeat(64) } })).rejects.toThrow();
    await expect(h.db.profilePhoto.create({ data: { userId: id, content: png, mediaType: 'text/plain', byteSize: png.length, sha256: 'a'.repeat(64) } })).rejects.toThrow();
    expect((await h.db.user.findUniqueOrThrow({ where: { id } })).version).toBe(1);
  });
  it('readiness fails closed when the database is unreachable', async () => {
    const query = jest.spyOn(h.db, '$queryRaw').mockRejectedValue(new Error('connection closed'));
    try { await request(h.server).get('/health/ready').expect(503); } finally { query.mockRestore(); }
  });
});
