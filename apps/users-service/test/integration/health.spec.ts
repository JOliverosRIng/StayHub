import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { UsersConfigModule } from '@users/infrastructure/config/config.module';
import { USERS_CONFIG, type UsersConfig } from '@users/infrastructure/config/users-config';
import { PrismaModule } from '@users/infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from '@users/modules/health/health.module';
import { MIGRATION_SOURCE } from '@users/modules/health/migration-source';

type HttpServer = Parameters<typeof request>[0];

function testDatabaseUrl(): string {
  const value = process.env['TEST_USERS_DATABASE_URL'];
  if (value === undefined || value === '') {
    throw new Error('TEST_USERS_DATABASE_URL is required for integration tests');
  }
  return value;
}

async function appWith(databaseUrl: string, expected: readonly string[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [UsersConfigModule, PrismaModule, HealthModule],
  })
    .overrideProvider(USERS_CONFIG)
    .useValue({ databaseUrl } as UsersConfig)
    .overrideProvider(MIGRATION_SOURCE)
    .useValue({ expectedMigrations: () => Promise.resolve(expected) })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

function server(app: INestApplication): HttpServer {
  return app.getHttpServer() as HttpServer;
}

describe('health endpoints (PostgreSQL 16)', () => {
  it('GET /health/live returns 200', async () => {
    const app = await appWith(testDatabaseUrl(), []);
    await request(server(app)).get('/health/live').expect(200, { status: 'ok' });
    await app.close();
  });

  it('GET /health/ready returns 200 when users_db is reachable and migrations are applied', async () => {
    const app = await appWith(testDatabaseUrl(), []);
    await request(server(app)).get('/health/ready').expect(200, { status: 'ready' });
    await app.close();
  });

  it('GET /health/ready returns 503 while a migration is pending', async () => {
    const app = await appWith(testDatabaseUrl(), ['99999999999999_not_applied']);
    await request(server(app)).get('/health/ready').expect(503);
    await app.close();
  });
});
