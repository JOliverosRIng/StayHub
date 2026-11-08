import 'reflect-metadata';

jest.setTimeout(30_000);

import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';

beforeAll(async () => {
  const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('PAYMENTS_TEST_DATABASE_URL is required for integration tests');
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const version = await prisma.$queryRaw<Array<{ version: number }>>`
      SELECT current_setting('server_version_num')::integer AS version
    `;
    if (Math.floor((version[0]?.version ?? 0) / 10_000) !== 16) {
      throw new Error('Payments integration tests require disposable PostgreSQL 16');
    }
    const migrations = await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = '001_payments_core'
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      ) AS ready
    `;
    if (!migrations[0]?.ready) throw new Error('Payments core migration is not applied');
  } finally {
    await prisma.$disconnect();
  }
});
