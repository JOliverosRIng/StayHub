import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { PrismaClient, type Prisma } from '../../src/infrastructure/persistence/generated/prisma';
import { AppModule } from '../../src/app.module';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '../../src/infrastructure/config/accommodations-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { AccommodationsLogger } from '../../src/infrastructure/logging/accommodations-logger';
import { testConfig } from '../fixtures/config.fixture';

export interface Harness {
  app: INestApplication; server: Server; db: PrismaService; config: AccommodationsConfig; url: string;
  close: () => Promise<void>; reset: () => Promise<void>;
}

export async function withRollback(db: PrismaService, test: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  const rollback = new Error('TEST_ROLLBACK');
  try { await db.$transaction(async (tx) => { await test(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
}

export function migrate(url: string): void {
  const env = { ...process.env, ACCOMMODATIONS_DATABASE_URL: url, CHECKPOINT_DISABLE: '1', CI: '1' };
  const args = [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'];
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execFileSync(process.execPath, args, { cwd: resolve('.'), env, stdio: ['ignore', 'ignore', 'ignore'], timeout: 60_000 });
      return;
    } catch (error) {
      last = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000 * attempt);
    }
  }
  throw last;
}

/** Creates an isolated schema in a disposable PostgreSQL 16 accommodations_db, applies real migrations and boots the app. */
export async function postgresHarness(): Promise<Harness> {
  const base = process.env.ACCOMMODATIONS_TEST_DATABASE_URL;
  if (!base) throw new Error('ACCOMMODATIONS_TEST_DATABASE_URL must point to a disposable PostgreSQL 16 accommodations_db');
  const url = new URL(base);
  if (url.pathname !== '/accommodations_db') throw new Error('Tests require an isolated accommodations_db');
  const schema = `test_${randomUUID().replace(/-/g, '')}`;
  const suite = basename(expect.getState().testPath ?? 'unknown-suite');
  // Report only stage metadata, never connection URLs, payloads or raw errors.
  const trace = (stage: string, state: 'error'): void => { process.stderr.write(`${JSON.stringify({ event: 'postgres-harness', suite, schema, stage, state })}\n`); };
  const step = async <T>(stage: string, operation: () => T | PromiseLike<T>): Promise<T> => {
    try { return await operation(); } catch (error) { trace(stage, 'error'); throw error; }
  };
  url.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  const version = await step('admin-version', () => admin.$queryRaw<{ server_version: string }[]>`SHOW server_version`);
  if (!version[0]?.server_version.startsWith('16.')) { await admin.$disconnect(); throw new Error('PostgreSQL 16 required'); }
  await step('create-schema', () => admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`));
  const config = testConfig(url.toString());
  try {
    await step('migrate', () => migrate(url.toString()));
    const module = await step('module-compile', () => Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ACCOMMODATIONS_CONFIG).useValue(config).compile());
    const app = module.createNestApplication({ logger: false });
    configureHttp(app, new AccommodationsLogger(() => undefined));
    await step('app-init', () => app.init());
    const db = app.get(PrismaService);
    return {
      app, server: app.getHttpServer() as Server, db, config, url: url.toString(),
      reset: async (): Promise<void> => { await step('reset', () => db.$executeRawUnsafe('TRUNCATE "Property" CASCADE')); },
      close: async (): Promise<void> => {
        await step('app-close', () => app.close());
        await step('drop-schema', () => admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`));
        await admin.$disconnect();
        rmSync(config.photoStorageRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await step('error-drop-schema', () => admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`));
    await admin.$disconnect();
    throw error;
  }
}
