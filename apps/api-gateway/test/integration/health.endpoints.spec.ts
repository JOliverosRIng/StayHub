import type { Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GatewayRedisService } from '@gateway/infrastructure/cache/gateway-redis.service';
import {
  HEALTH_HOST_RESOLVER,
  HEALTH_PREFIX_EXCLUDE,
  HEALTH_TLS_READER,
} from '@gateway/modules/health/health.controller';
import { HealthModule } from '@gateway/modules/health/health.module';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

interface Overrides {
  readonly redis: boolean;
  readonly tls: boolean;
  readonly resolves: boolean;
}

const originalEnv = process.env;

async function buildApp(overrides: Overrides): Promise<INestApplication> {
  const { env } = createTestGatewayConfig();
  process.env = { ...originalEnv, ...env };

  const moduleRef = await Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(GatewayRedisService)
    .useValue({ ping: (): Promise<boolean> => Promise.resolve(overrides.redis) })
    .overrideProvider(HEALTH_HOST_RESOLVER)
    .useValue({ resolves: (): Promise<boolean> => Promise.resolve(overrides.resolves) })
    .overrideProvider(HEALTH_TLS_READER)
    .useValue({ readable: (): boolean => overrides.tls })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('/api/v1', { exclude: [...HEALTH_PREFIX_EXCLUDE] });
  await app.init();
  return app;
}

function server(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

describe('Endpoints de salud del Gateway (GW-020)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
    process.env = originalEnv;
  });

  it('sirve /health/live en la raiz sin depender de nada aunque todo este caido', async () => {
    app = await buildApp({ redis: false, tls: false, resolves: false });

    const response = await request(server(app)).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'live' });
  });

  it('sirve /health/ready con 200 cuando config, TLS, Redis y destinos responden', async () => {
    app = await buildApp({ redis: true, tls: true, resolves: true });

    const response = await request(server(app)).get('/health/ready');

    expect(response.status).toBe(200);
    const body = response.body as { status: string; checks: Record<string, boolean> };
    expect(body.status).toBe('ready');
    expect(body.checks).toEqual({ config: true, tls: true, redis: true, destinations: true });
  });

  it('devuelve 503 en /health/ready cuando Redis no responde', async () => {
    app = await buildApp({ redis: false, tls: true, resolves: true });

    const response = await request(server(app)).get('/health/ready');

    expect(response.status).toBe(503);
    const body = response.body as { checks: Record<string, boolean> };
    expect(body.checks.redis).toBe(false);
  });

  it('mantiene los endpoints de salud fuera del prefijo /api/v1', async () => {
    app = await buildApp({ redis: true, tls: true, resolves: true });

    const live = await request(server(app)).get('/api/v1/health/live');
    const ready = await request(server(app)).get('/api/v1/health/ready');

    expect(live.status).toBe(404);
    expect(ready.status).toBe(404);
  });
});
