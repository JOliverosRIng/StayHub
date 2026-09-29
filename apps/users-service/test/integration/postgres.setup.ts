import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { PrismaClient, type Prisma } from '../../src/infrastructure/persistence/generated/prisma';
import { AppModule } from '../../src/app.module';
import { USERS_CONFIG } from '../../src/infrastructure/config/users-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { UsersLogger } from '../../src/infrastructure/logging/users-logger';
import { testConfig } from '../fixtures/users.fixture';

export interface Harness { app: INestApplication; server: Server; db: PrismaService; close: () => Promise<void>; reset: () => Promise<void> }
export async function withRollback(db: PrismaService, test: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  const rollback = new Error('TEST_ROLLBACK');
  try { await db.$transaction(async (tx) => { await test(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
}
export async function postgresHarness(): Promise<Harness> {
  const base = process.env.USERS_TEST_DATABASE_URL;
  if (!base) throw new Error('USERS_TEST_DATABASE_URL must point to a disposable PostgreSQL 16 users_db');
  const url = new URL(base);
  if (url.pathname !== '/users_db') throw new Error('Tests require an isolated users_db');
  const schema = `test_${randomUUID().replace(/-/g, '')}`;
  url.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  const version = await admin.$queryRaw<{ server_version: string }[]>`SHOW server_version`;
  if (!version[0]?.server_version.startsWith('16.')) { await admin.$disconnect(); throw new Error('PostgreSQL 16 required'); }
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    execFileSync(process.execPath, [resolve('../../node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: resolve('.'), env: { ...process.env, USERS_DATABASE_URL: url.toString() }, stdio: 'pipe' });
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(USERS_CONFIG).useValue(testConfig(url.toString())).compile();
    const app = module.createNestApplication({ logger: false });
    configureHttp(app, new UsersLogger(() => undefined));
    await app.init();
    const db = app.get(PrismaService);
    return { app, server: (app.getHttpServer() as Server), db,
      reset: async (): Promise<void> => { await db.user.deleteMany(); },
      close: async (): Promise<void> => { await app.close(); await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await admin.$disconnect(); },
    };
  } catch (error) { await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await admin.$disconnect(); throw error; }
}
