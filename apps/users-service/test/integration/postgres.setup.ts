import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { UsersConfig } from '@users/infrastructure/config/users-config';
import {
  PrismaService,
  type PrismaTransactionClient,
} from '@users/infrastructure/persistence/prisma/prisma.service';

const WORKSPACE_DIR = resolve(__dirname, '..', '..');

export interface PostgresHarness {
  readonly prisma: PrismaService;
  /** Runs `work` in a transaction that is always rolled back, returning its result. */
  withRollback<T>(work: (tx: PrismaTransactionClient) => Promise<T>): Promise<T>;
  /** Truncates every application table; use for suites that need committed, concurrent writes. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

class RollbackSignal<T> extends Error {
  public constructor(public readonly result: T) {
    super('rollback');
  }
}

export function assertTestDatabase(databaseUrl: string): void {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!/test/i.test(name)) {
    throw new Error('TEST_USERS_DATABASE_URL must point to a test database');
  }
}

export async function createPostgresHarness(): Promise<PostgresHarness> {
  const databaseUrl = testDatabaseUrl();
  assertTestDatabase(databaseUrl);
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
      cwd: WORKSPACE_DIR,
      env: { ...process.env, USERS_DATABASE_URL: databaseUrl },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    },
  );

  const prisma = new PrismaService({ databaseUrl } as UsersConfig);
  await prisma.onModuleInit();

  return {
    prisma,
    withRollback: async <T>(work: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> => {
      try {
        await prisma.transaction(async (tx) => {
          throw new RollbackSignal(await work(tx));
        });
      } catch (error) {
        if (error instanceof RollbackSignal) {
          return error.result as T;
        }
        throw error;
      }
      throw new Error('unreachable');
    },
    reset: async (): Promise<void> => {
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      `;
      if (tables.length > 0) {
        const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      }
    },
    close: (): Promise<void> => prisma.onModuleDestroy(),
  };
}

function testDatabaseUrl(): string {
  const value = process.env['TEST_USERS_DATABASE_URL'];
  if (value === undefined || value === '') {
    throw new Error('TEST_USERS_DATABASE_URL is required for integration tests');
  }
  return value;
}
