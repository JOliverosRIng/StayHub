import request from 'supertest';
import { postgresHarness, type Harness } from './postgres.setup';

describe('ACC-005/007 health against real PostgreSQL 16', () => {
  let h: Harness;
  beforeAll(async () => { h = await postgresHarness(); });
  afterAll(async () => { await h?.close(); });

  it('liveness and readiness succeed with accommodations_db migrated', async () => {
    await request(h.server).get('/health/live').expect(200, { status: 'live' });
    await request(h.server).get('/health/ready').expect(200, { status: 'ready' });
  });

  it('readiness fails closed when the database is unreachable while liveness stays up', async () => {
    const query = jest.spyOn(h.db, '$queryRaw').mockRejectedValue(new Error('connection closed'));
    try {
      await request(h.server).get('/health/ready').expect(503);
      await request(h.server).get('/health/live').expect(200);
    } finally { query.mockRestore(); }
  });

  it('connects only to the configured accommodations_db', async () => {
    const rows = await h.db.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(rows[0]?.db).toBe('accommodations_db');
  });
});
