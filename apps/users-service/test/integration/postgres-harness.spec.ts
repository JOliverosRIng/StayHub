import { aPendingUser } from '../fixtures/users.fixture';
import { assertTestDatabase, createPostgresHarness, type PostgresHarness } from './postgres.setup';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function tableExists(harness: PostgresHarness, table: string): Promise<boolean> {
  const rows = await harness.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass('public.${table}') IS NOT NULL AS exists`,
  );
  return rows[0]?.exists === true;
}

describe('PostgreSQL 16 integration harness', () => {
  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await createPostgresHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('runs against PostgreSQL 16', async () => {
    const rows = await harness.prisma.$queryRaw<
      Array<{ version: string }>
    >`SELECT current_setting('server_version') AS version`;
    expect(rows[0]?.version).toMatch(/^16\./);
  });

  it('discards everything written inside withRollback', async () => {
    const result = await harness.withRollback(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TABLE harness_rollback_probe (id int)');
      await tx.$executeRawUnsafe('INSERT INTO harness_rollback_probe VALUES (1)');
      return 'done';
    });

    expect(result).toBe('done');
    await expect(tableExists(harness, 'harness_rollback_probe')).resolves.toBe(false);
  });

  it('propagates failures raised inside withRollback', async () => {
    await expect(
      harness.withRollback(() => Promise.reject(new Error('work failed'))),
    ).rejects.toThrow('work failed');
  });

  it('reset removes committed rows but keeps migration history', async () => {
    await harness.prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS harness_reset_probe (id int)');
    await harness.prisma.$executeRawUnsafe('INSERT INTO harness_reset_probe VALUES (1), (2)');

    await harness.reset();

    const rows = await harness.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM harness_reset_probe',
    );
    expect(rows[0]?.count).toBe(0n);
    await harness.prisma.$executeRawUnsafe('DROP TABLE harness_reset_probe');
  });

  it('refuses databases that are not dedicated to tests', () => {
    expect(() => assertTestDatabase('postgresql://u:p@users-db:5432/users_db')).toThrow(
      'must point to a test database',
    );
    expect(() => assertTestDatabase('postgresql://u:p@localhost:5432/users_test')).not.toThrow();
  });
});

describe('synthetic user fixtures', () => {
  it('builds unique, normalized, public-role pending users', () => {
    const first = aPendingUser();
    const second = aPendingUser();

    expect(first.id).toMatch(UUID);
    expect(first.registrationId).toMatch(UUID);
    expect(first.id).not.toBe(second.id);
    expect(first.emailNormalized).not.toBe(second.emailNormalized);
    expect(first.emailNormalized).toBe(first.email.trim().toLowerCase());
    expect(first.email).toMatch(/@example\.test$/i);
    expect(['GUEST', 'OWNER']).toContain(first.role);
    expect(first.name.trim().length).toBeGreaterThanOrEqual(2);
  });

  it('applies overrides and keeps emailNormalized consistent', () => {
    const user = aPendingUser({ email: '  Mixed.Case@Example.TEST ', role: 'OWNER' });

    expect(user.role).toBe('OWNER');
    expect(user.emailNormalized).toBe('mixed.case@example.test');
  });
});
