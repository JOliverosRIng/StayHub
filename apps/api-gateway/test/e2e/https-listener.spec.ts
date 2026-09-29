import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { Controller, Get, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

import { startGateway } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

@Controller('probe')
class ProbeController {
  @Get()
  probe(): { status: string } {
    return { status: 'ok' };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const { config, tls } = createTestGatewayConfig();

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const call = httpsRequest(
      { host: '127.0.0.1', port: config.port, path: url, servername: 'localhost', ca: tls.certPem },
      (response) => {
        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    call.on('error', reject);
    call.end();
  });
}

function plainHttpProbe(): Promise<string> {
  return new Promise((resolve) => {
    const call = httpRequest({ host: '127.0.0.1', port: config.port, path: '/api/v1/probe' }, (response) => {
      resolve(`respuesta HTTP válida con estado ${response.statusCode ?? 0}`);
    });
    call.on('error', (error: NodeJS.ErrnoException) => resolve(`error ${error.code ?? error.message}`));
    call.end();
  });
}

describe('GW-010 listener HTTPS en 8080 con prefijo /api/v1', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startGateway(config, ProbeModule);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the application over TLS on the configured port', async () => {
    const response = await get('/api/v1/probe');
    expect(response.status).toBe(200);
    expect(response.body).toContain('"status":"ok"');
  });

  it('applies the global prefix and does not serve unprefixed paths', async () => {
    const prefixed = await get('/api/v1/probe');
    expect(prefixed.status).toBe(200);
    const unprefixed = await get('/probe');
    expect(unprefixed.status).toBe(404);
    expect(unprefixed.body).toContain('Cannot GET /probe');
  });

  it('refuses a plaintext HTTP client on the public port', async () => {
    const outcome = await plainHttpProbe();
    expect(outcome).not.toMatch(/^respuesta HTTP válida/);
  });
});
