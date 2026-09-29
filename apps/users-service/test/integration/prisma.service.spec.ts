import { PrismaService } from '@users/infrastructure/persistence/prisma/prisma.service';
import type { UsersConfig } from '@users/infrastructure/config/users-config';

function configFor(databaseUrl: string): UsersConfig {
  return { databaseUrl } as UsersConfig;
}

function testDatabaseUrl(): string {
  const value = process.env['TEST_USERS_DATABASE_URL'];
  if (value === undefined || value === '') {
    throw new Error('TEST_USERS_DATABASE_URL is required for integration tests');
  }
  return value;
}

describe('PrismaService (users_db)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService(configFor(testDatabaseUrl()));
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('connects only to the configured users database', async () => {
    const rows = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
    expect(rows[0]?.db).toBe(new URL(testDatabaseUrl()).pathname.slice(1));
  });

  it('reports the database as reachable', async () => {
    await expect(prisma.isReachable()).resolves.toBe(true);
  });

  it('commits work executed inside a local transaction', async () => {
    const result = await prisma.transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`;
      return rows[0]?.value;
    });
    expect(result).toBe(1);
  });

  it('rolls back a local transaction when the work fails', async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS prisma_tx_probe');
    await prisma.$executeRawUnsafe('CREATE TABLE prisma_tx_probe (id int)');
    await expect(
      prisma.transaction(async (tx) => {
        await tx.$executeRawUnsafe('INSERT INTO prisma_tx_probe (id) VALUES (1)');
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM prisma_tx_probe`;
    expect(rows[0]?.count).toBe(0n);
    await prisma.$executeRawUnsafe('DROP TABLE prisma_tx_probe');
  });

  it('returns applied migration names, or an empty list before any migration', async () => {
    const names = await prisma.appliedMigrationNames();
    expect(Array.isArray(names)).toBe(true);
  });

  it('reports an unreachable database without throwing', async () => {
    const broken = new PrismaService(
      configFor('postgresql://nobody:nothing@127.0.0.1:1/users_db?connect_timeout=1'),
    );
    await expect(broken.isReachable()).resolves.toBe(false);
    await broken.$disconnect();
  });
});
