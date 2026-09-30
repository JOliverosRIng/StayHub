import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { INestApplication } from '@nestjs/common';

import { startGateway } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

// Redis apunta a un puerto local sin servicio: la sonda de readiness falla rápido y cerrado,
// sin depender de un host externo ni dejar reconexiones colgadas.
const { config, tls, env } = createTestGatewayConfig({
  GATEWAY_REDIS_URL: 'redis://127.0.0.1:56399',
});

interface HttpsResult {
  readonly status: number;
  readonly body: string;
  readonly headers: Record<string, string | string[] | undefined>;
}

function get(path: string): Promise<HttpsResult> {
  return new Promise((resolve, reject) => {
    const call = httpsRequest(
      { host: '127.0.0.1', port: config.port, path, servername: 'localhost', ca: tls.certPem },
      (response) => {
        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, body, headers: response.headers }),
        );
      },
    );
    call.on('error', reject);
    call.end();
  });
}

function plainHttp(path: string): Promise<string> {
  return new Promise((resolve) => {
    const call = httpRequest({ host: '127.0.0.1', port: config.port, path }, (response) => {
      resolve(`respuesta HTTP válida con estado ${response.statusCode ?? 0}`);
    });
    call.on('error', (error: NodeJS.ErrnoException) => resolve(`error ${error.code ?? error.message}`));
    call.end();
  });
}

describe('Arranque integrado del Gateway (GW-022)', () => {
  let app: INestApplication;
  const originalEnv = process.env;

  beforeAll(async () => {
    process.env = { ...originalEnv, ...env };
    app = await startGateway(config);
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it('sirve /health/live por HTTPS con traceId de respuesta', async () => {
    const response = await get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toContain('"status":"live"');
    expect(response.headers['x-trace-id']).toBeDefined();
  });

  it('responde en /health/ready (200 listo o 503 si una dependencia falta)', async () => {
    const response = await get('/health/ready');

    expect([200, 503]).toContain(response.status);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('mantiene las sondas de salud fuera del prefijo /api/v1', async () => {
    const prefixed = await get('/api/v1/health/live');

    expect(prefixed.status).toBe(404);
  });

  it('aplica el filtro global de Problem Details en rutas /api/v1 desconocidas', async () => {
    const response = await get('/api/v1/ruta-inexistente');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toContain('"traceId"');
    expect(response.body).toContain('"status":404');
  });

  it('rechaza a un cliente HTTP en claro en el puerto público', async () => {
    const outcome = await plainHttp('/health/live');

    expect(outcome).not.toMatch(/^respuesta HTTP válida/);
  });
});
