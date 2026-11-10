import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { HealthController } from '../../src/modules/health/health.controller';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { RabbitMqPublisher } from '../../src/infrastructure/messaging/rabbitmq.publisher';
import { OUTBOX_REPOSITORY } from '../../src/infrastructure/messaging/outbox.tokens';
import { RECONCILIATION_REPOSITORY } from '../../src/infrastructure/messaging/reconciliation.tokens';

describe('Payments health endpoints', () => {
  let app: INestApplication;
  let databaseReachable = true;
  let migrationApplied = true;

  beforeEach(async () => {
    databaseReachable = true;
    migrationApplied = true;
    const prisma = {
      isReachable: (): Promise<boolean> => Promise.resolve(databaseReachable),
      hasAppliedMigrations: (): Promise<boolean> => Promise.resolve(migrationApplied),
    };
    const outbox = {
      countByStatus: (): Promise<{ pending: number; dead: number }> => Promise.resolve({ pending: 3, dead: 1 }),
    };
    const reconciliation = {
      oldestPendingAgeSeconds: (): Promise<number> => Promise.resolve(42),
    };
    @Module({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: PAYMENTS_CONFIG, useValue: { rabbitmqUrl: undefined } satisfies Partial<PaymentsConfig> },
        { provide: RabbitMqPublisher, useValue: { isHealthy: (): boolean => false } },
        { provide: OUTBOX_REPOSITORY, useValue: outbox },
        { provide: RECONCILIATION_REPOSITORY, useValue: reconciliation },
      ],
    })
    class TestModule {}
    app = await NestFactory.create(TestModule, { bodyParser: false, logger: false });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports process liveness without probing dependencies', async () => {
    await request(app.getHttpServer() as Server).get('/health/live').expect(200).expect({ status: 'ok' });
  });

  it('returns ready while RabbitMQ is degraded and does not block startup/readiness', async () => {
    const response = await request(app.getHttpServer() as Server).get('/health/ready').expect(200);
    expect(response.body).toEqual({
      status: 'degraded',
      checks: { database: 'up', migration: 'applied', rabbitmq: 'degraded' },
    });
  });

  it('returns 503 Problem Details if the database is down or migration is pending', async () => {
    databaseReachable = false;
    await request(app.getHttpServer() as Server)
      .get('/health/ready')
      .expect('Content-Type', /application\/problem\+json/)
      .expect(503);

    databaseReachable = true;
    migrationApplied = false;
    await request(app.getHttpServer() as Server)
      .get('/health/ready')
      .expect('Content-Type', /application\/problem\+json/)
      .expect(503);
  });

  it('exposes Prometheus gauges for pending and dead outbox events', async () => {
    await request(app.getHttpServer() as Server)
      .get('/health/metrics')
      .expect('Content-Type', /text\/plain/)
      .expect(200)
      .expect(/payments_outbox_pending 3/)
      .expect(/payments_outbox_dead 1/)
      .expect(/payments_pending_age_seconds 42/);
  });
});
