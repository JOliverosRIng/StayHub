import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';
import { pendingFixture, serviceToken } from '../fixtures/users.fixture';
import { PrismaUserRepository } from '../../src/infrastructure/persistence/prisma/user.repository';
import { DomainError } from '../../src/domain/shared/domain-error';
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
  it('rechecks terminal state after waiting for a concurrent activation lock', async () => {
    const body = pendingFixture();
    await request(h.server).post('/internal/v1/registrations').set('Authorization', `Bearer ${serviceToken()}`).send(body).expect(201);
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const activation = h.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${body.userId}::uuid FOR UPDATE`;
      locked();
      await gate;
      await tx.user.update({ where: { id: body.userId }, data: { status: 'ACTIVE' } });
    });
    await acquired;
    const cancellation = new PrismaUserRepository(h.db).transition(body.registrationId, 'CANCELLED')
      .then(() => 'ACCEPTED', (error: unknown) => error instanceof DomainError ? error.code : 'UNEXPECTED_ERROR');
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 40 && !waiting; attempt += 1) {
        const rows = await h.db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%User%'
        ) AS waiting`;
        waiting = rows[0]?.waiting === true;
        if (!waiting) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally { release(); await activation; }
    expect(await cancellation).toBe('STATE_CONFLICT');
    expect((await h.db.user.findUniqueOrThrow({ where: { id: body.userId } })).status).toBe('ACTIVE');
  });
});
