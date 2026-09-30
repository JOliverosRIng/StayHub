import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface IntegrationDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  clean(): Promise<void>;
  close(): Promise<void>;
}

export function assertSafeCleanupTargets(
  databaseUrl: string,
  redisUrl: string,
  allowCleanup: string | undefined,
): void {
  if (allowCleanup !== 'true') {
    throw new Error('AUTH_TEST_ALLOW_CLEANUP=true is required before cleaning test data');
  }
  const dbName = databaseName(databaseUrl);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to clean database "${dbName}": test database name must end with _test`);
  }
  const redisDb = redisDatabaseIndex(redisUrl);
  if (redisDb !== 15) {
    throw new Error(`Refusing to clean Redis database ${redisDb}: integration harness requires DB 15`);
  }
}

function databaseName(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === '') throw new Error('TEST_AUTH_DATABASE_URL must include a database name');
  return name;
}

function redisDatabaseIndex(url: string): number {
  const path = new URL(url).pathname.replace(/^\//, '');
  return path === '' ? 0 : Number(path);
}

export async function createIntegrationDependencies(): Promise<IntegrationDependencies> {
  const databaseUrl = required('TEST_AUTH_DATABASE_URL');
  const redisUrl = required('TEST_AUTH_REDIS_URL');
  assertSafeCleanupTargets(databaseUrl, redisUrl, process.env.AUTH_TEST_ALLOW_CLEANUP);
  const previousDatabaseUrl = process.env.AUTH_DATABASE_URL;
  const previousRedisUrl = process.env.AUTH_REDIS_URL;
  process.env.AUTH_DATABASE_URL = databaseUrl;
  process.env.AUTH_REDIS_URL = redisUrl;
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
  );
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await Promise.all([prisma.$connect(), redis.connect()]);

  const clean = async (): Promise<void> => {
    assertSafeCleanupTargets(databaseUrl, redisUrl, process.env.AUTH_TEST_ALLOW_CLEANUP);
    await prisma.$transaction([
      prisma.refreshToken.deleteMany(),
      prisma.session.deleteMany(),
      prisma.registration.deleteMany(),
      prisma.credential.deleteMany(),
    ]);
    await redis.flushdb();
  };
  return {
    prisma,
    redis,
    clean,
    close: async (): Promise<void> => {
      await Promise.all([prisma.$disconnect(), redis.quit()]);
      restore('AUTH_DATABASE_URL', previousDatabaseUrl);
      restore('AUTH_REDIS_URL', previousRedisUrl);
    },
  };
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function required(name: 'TEST_AUTH_DATABASE_URL' | 'TEST_AUTH_REDIS_URL'): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required for integration tests`);
  return value;
}
