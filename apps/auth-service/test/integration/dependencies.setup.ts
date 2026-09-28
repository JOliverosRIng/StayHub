import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface IntegrationDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  clean(): Promise<void>;
  close(): Promise<void>;
}

export async function createIntegrationDependencies(): Promise<IntegrationDependencies> {
  const databaseUrl = required('TEST_AUTH_DATABASE_URL');
  const redisUrl = required('TEST_AUTH_REDIS_URL');
  process.env.AUTH_DATABASE_URL = databaseUrl;
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
  );
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await Promise.all([prisma.$connect(), redis.connect()]);

  const clean = async (): Promise<void> => {
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
    },
  };
}

function required(name: 'TEST_AUTH_DATABASE_URL' | 'TEST_AUTH_REDIS_URL'): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required for integration tests`);
  return value;
}
