import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { HealthController } from '../../src/modules/health/health.controller';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { SEARCH_CACHE_PORT } from '../../src/application/ports/search-cache.port';
import { SEARCH_CONFIG } from '../../src/infrastructure/config/config.module';
import { RabbitMqHealth } from '../../src/infrastructure/health/rabbitmq-health';
import { ShutdownState } from '../../src/infrastructure/lifecycle/shutdown-state';
import { configureSearchHttp } from '../../src/interfaces/http/configure-search-http';
import { SearchLogger } from '../../src/infrastructure/observability/search-logger';

describe('Search health HTTP contract', () => {
  let app: INestApplication;
  const database = jest.fn(); const redis = jest.fn(); const rabbitmq = jest.fn();
  let shutdown: ShutdownState;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController], providers: [
      { provide: PrismaService, useValue: { isHealthy: database } },
      { provide: SEARCH_CACHE_PORT, useValue: { health: redis } },
      { provide: RabbitMqHealth, useValue: { health: rabbitmq } },
      { provide: SEARCH_CONFIG, useValue: { dependencyTimeoutMs: 20 } },
      ShutdownState,
    ] }).compile();
    app = module.createNestApplication();
    const logger = new SearchLogger(); jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    configureSearchHttp(app, logger); await app.init(); shutdown = app.get(ShutdownState);
  });
  beforeEach(() => { database.mockReset().mockResolvedValue(true); redis.mockReset().mockResolvedValue(true); rabbitmq.mockReset().mockResolvedValue(true); });
  afterAll(async () => { await app.close(); });
  it('keeps liveness independent of dependencies and authentication', async () => {
    database.mockResolvedValue(false);
    await request(app.getHttpServer() as Server).get('/health/live').expect(200, { status: 'ok' });
    expect(database).not.toHaveBeenCalled();
  });
  it('is ready only after the database/migration probe succeeds', async () => {
    await request(app.getHttpServer() as Server).get('/health/ready').expect(200, { status: 'ready', degraded: [] });
    database.mockResolvedValue(false);
    const response = await request(app.getHttpServer() as Server).get('/health/ready').expect(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toEqual(expect.objectContaining({ code: 'SEARCH_DEPENDENCY_UNAVAILABLE', traceId: response.headers['x-trace-id'] as string }));
  });
  it('reports Redis and RabbitMQ failures without blocking reads', async () => {
    redis.mockRejectedValue(new Error('redis://secret')); rabbitmq.mockResolvedValue(false);
    await request(app.getHttpServer() as Server).get('/health/ready').expect(200, { status: 'ready', degraded: ['redis', 'rabbitmq'] });
  });
  it('bounds hung optional probes and still reports ready', async () => {
    rabbitmq.mockImplementation(() => new Promise<boolean>(() => undefined));
    await request(app.getHttpServer() as Server).get('/health/ready').expect(200, { status: 'ready', degraded: ['rabbitmq'] });
  });
  it('bounds an unavailable database and does not expose query terms in errors', async () => {
    database.mockImplementation(() => new Promise<boolean>(() => undefined));
    const response = await request(app.getHttpServer() as Server).get('/health/ready?q=private').set('x-trace-id', 'safe-123').expect(503);
    expect(response.body).toEqual(expect.objectContaining({ instance: '/health/ready', traceId: 'safe-123' }));
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
  it('rejects readiness during shutdown', async () => {
    shutdown.begin();
    await request(app.getHttpServer() as Server).get('/health/ready').expect(503);
    expect(database).not.toHaveBeenCalled();
    await request(app.getHttpServer() as Server).get('/health/live').expect(200);
  });
});
