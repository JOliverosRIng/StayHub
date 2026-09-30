import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import { SignJWT, importPKCS8 } from 'jose';

import { stripClientHeaders } from '@gateway/interfaces/http/security/identity-header.interceptor';

import { startGateway } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-050 — Spoofing de cabeceras de identidad (FR-011–FR-013, FR-020–FR-024).
 *
 * Test-first: el endurecimiento del stripping/allowlist se implementa en GW-052, por lo que este
 * spec DEBE quedar en rojo. `stripClientHeaders` (GW-017) ya existe y elimina un conjunto de
 * cabeceras, pero su cobertura es INSUFICIENTE: no cubre vectores como `x-sub`, `x-roles`,
 * `x-user`, `true-client-ip`, `cf-connecting-ip` ni `x-forwarded-client-cert`. Las aserciones que
 * exigen eliminarlos fallan (endurecimiento ausente), no por sintaxis ni por harness — typecheck y
 * lint quedan verdes. Cuando GW-052 endurezca el stripping, estas pruebas pasarán a verde.
 *
 * La identidad efectiva SIEMPRE proviene del bearer validado por el guard (GW-040), nunca de
 * cabeceras del cliente.
 */

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const EVIL_ID = '99999999-9999-4999-8999-999999999999';

const SPOOFED_IDENTITY_HEADERS: readonly string[] = [
  'x-user-id',
  'x-user-role',
  'x-user-email',
  'x-sub',
  'x-roles',
  'x-user',
  'x-userid',
  'x-session-id',
  'x-authenticated-user',
  'x-forwarded-user',
  'x-principal',
  'x-gateway-user',
];

const SPOOFED_FORWARDING_HEADERS: readonly string[] = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-real-ip',
  'x-client-ip',
  'forwarded',
  'true-client-ip',
  'cf-connecting-ip',
  'x-original-forwarded-for',
  'x-forwarded-client-cert',
];

const SPOOFED_SERVICE_HEADERS: readonly string[] = [
  'x-service-token',
  'x-service-auth',
  'x-service-jwt',
  'x-service-authorization',
  'x-api-key',
  'x-internal-token',
];

function stripped(headers: Record<string, string>): Record<string, unknown> {
  const request = { headers: { ...headers } } as unknown as Request;
  stripClientHeaders(request);
  return request.headers as unknown as Record<string, unknown>;
}

function forge(names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, 'forged']));
}

describe('Spoofing de cabeceras de identidad (GW-050)', () => {
  describe('stripClientHeaders (GW-017) elimina todo vector de suplantación', () => {
    it('elimina las cabeceras de identidad inyectadas por el cliente', () => {
      const result = stripped({ ...forge(SPOOFED_IDENTITY_HEADERS), authorization: 'Bearer real' });
      for (const name of SPOOFED_IDENTITY_HEADERS) {
        expect(result[name]).toBeUndefined();
      }
    });

    it('elimina las cabeceras de forwarding/IP falsas', () => {
      const result = stripped({ ...forge(SPOOFED_FORWARDING_HEADERS), authorization: 'Bearer real' });
      for (const name of SPOOFED_FORWARDING_HEADERS) {
        expect(result[name]).toBeUndefined();
      }
    });

    it('elimina un service JWT/credencial de servicio aportado por el cliente', () => {
      const result = stripped({ ...forge(SPOOFED_SERVICE_HEADERS), authorization: 'Bearer real' });
      for (const name of SPOOFED_SERVICE_HEADERS) {
        expect(result[name]).toBeUndefined();
      }
    });

    it('conserva el bearer validado y las cabeceras benignas', () => {
      const result = stripped({
        authorization: 'Bearer real-user-token',
        accept: 'application/json',
        'content-type': 'application/json',
        'x-trace-id': 'trace-123',
        'x-user-id': 'victim',
      });
      expect(result['authorization']).toBe('Bearer real-user-token');
      expect(result['accept']).toBe('application/json');
      expect(result['content-type']).toBe('application/json');
      expect(result['x-trace-id']).toBe('trace-123');
      expect(result['x-user-id']).toBeUndefined();
    });
  });

  describe('extremo a extremo: la identidad proviene solo del bearer', () => {
    const stub = createAuthStub();
    const { config, tls, env, servicePrivateKeyPem } = createTestGatewayConfig();
    const kid = Object.keys(config.userJwt.publicKeys)[0] ?? 'stayhub-auth-2026-01';
    let app: INestApplication;
    const originalEnv = process.env;

    async function mintBearer(sub: string, role = 'GUEST'): Promise<string> {
      const key = await importPKCS8(servicePrivateKeyPem, 'RS256');
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ role, sid: randomUUID() })
        .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
        .setSubject(sub)
        .setIssuer(config.userJwt.issuer)
        .setAudience(config.userJwt.audience)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .setJti(randomUUID())
        .sign(key);
    }

    function get(path: string, headers: Record<string, string>): Promise<{ status: number; json: unknown }> {
      return new Promise((resolve, reject) => {
        const call = httpsRequest(
          { host: '127.0.0.1', port: config.port, path, method: 'GET', servername: 'localhost', ca: tls.certPem, headers },
          (res) => {
            let raw = '';
            res.on('data', (chunk: Buffer) => {
              raw += chunk.toString();
            });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, json: safeParse(raw) }));
          },
        );
        call.on('error', reject);
        call.end();
      });
    }

    beforeAll(async () => {
      await stub.listen();
      process.env = {
        ...originalEnv,
        ...env,
        GATEWAY_AUTH_BASE_URL: stub.baseUrl(),
        GATEWAY_USERS_BASE_URL: stub.baseUrl(),
        GATEWAY_REDIS_URL: process.env['GATEWAY_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:56399',
      };
      app = await startGateway(config);
    });

    afterAll(async () => {
      await app.close();
      await new Promise<void>((resolve) => stub.server.close(() => resolve()));
      process.env = originalEnv;
    });

    it('ignora x-user-id/x-user-role/x-sub falsos: /auth/validate refleja el bearer', async () => {
      stub.reset();
      const bearer = await mintBearer(OWNER_ID, 'GUEST');
      const reply = await get('/api/v1/auth/validate', {
        authorization: `Bearer ${bearer}`,
        'x-user-id': EVIL_ID,
        'x-sub': EVIL_ID,
        'x-user-role': 'ADMIN',
        'x-roles': 'ADMIN',
      });

      expect(reply.status).toBe(200);
      const body = (reply.json ?? {}) as Record<string, unknown>;
      expect(body['userId']).toBe(OWNER_ID);
      expect(body['role']).toBe('GUEST');
    });

    it('no reenvía a Auth ninguna cabecera de identidad/servicio del cliente', async () => {
      stub.reset();
      const bearer = await mintBearer(OWNER_ID, 'GUEST');
      await get('/api/v1/auth/validate', {
        authorization: `Bearer ${bearer}`,
        'x-user-id': EVIL_ID,
        'x-service-token': 'forged-service',
        'x-forwarded-for': '203.0.113.9',
        'true-client-ip': '203.0.113.9',
      });

      const received = stub.lastHeaders();
      for (const name of [...SPOOFED_IDENTITY_HEADERS, ...SPOOFED_FORWARDING_HEADERS, ...SPOOFED_SERVICE_HEADERS]) {
        expect(received[name]).toBeUndefined();
      }
    });
  });
});

interface AuthStub {
  readonly server: Server;
  listen(): Promise<void>;
  baseUrl(): string;
  reset(): void;
  lastHeaders(): IncomingHttpHeaders;
}

function createAuthStub(): AuthStub {
  const state: { headers: IncomingHttpHeaders } = { headers: {} };
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    incoming.on('data', () => undefined);
    incoming.on('end', () => {
      state.headers = incoming.headers;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ active: true, role: 'GUEST' }));
    });
  });
  return {
    server,
    listen: (): Promise<void> =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
      }),
    baseUrl: (): string => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('stub not listening');
      return `http://127.0.0.1:${address.port}`;
    },
    reset: (): void => {
      state.headers = {};
    },
    lastHeaders: (): IncomingHttpHeaders => state.headers,
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
