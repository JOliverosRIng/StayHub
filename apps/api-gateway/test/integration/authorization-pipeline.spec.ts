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
import { SignJWT, importPKCS8 } from 'jose';

import { startGateway } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-054 — Integración del pipeline de autorización de perfil (US3 enrutado + US4 autorización).
 *
 * Arranca el Gateway real por HTTPS con stubs locales de Auth (introspección) y Users, y comprueba
 * que las cuatro etapas se componen en orden ESTRICTO y que cada etapa cortocircuita las siguientes:
 *
 *   Passport (GW-016) → introspección (GW-039) → ownership (GW-053) → routing a Users (GW-046)
 *
 * En particular verifica la precedencia 401 → 403 y que NINGUNA operación no autorizada (401/403) ni
 * con dependencia caída (503) contacta a Users. FR-011–FR-013, FR-020–FR-024, SC-003–SC-004.
 */

const OWNER_ID = '11111111-1111-4111-8111-111111111111'; // GUEST, dueño
const OTHER_ID = '33333333-3333-4333-8333-333333333333'; // identidad ajena
const DOWN_ID = '55555555-5555-4555-8555-555555555555'; // introspección caída → 503

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly json: unknown;
}

interface Stub {
  readonly server: Server;
  listen(): Promise<void>;
  baseUrl(): string;
  reset(): void;
  usersCalls(): number;
  lastUsersAuth(): string | undefined;
}

function roleFor(userId: string): string {
  return userId === OTHER_ID ? 'OWNER' : 'GUEST';
}

function createStub(): Stub {
  const state: { usersCalls: number; lastUsersAuth: string | undefined } = {
    usersCalls: 0,
    lastUsersAuth: undefined,
  };
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const url = incoming.url ?? '';
      if (url.includes('/sessions/validate')) {
        const parsed = safeParse(Buffer.concat(chunks).toString()) as { userId?: string } | undefined;
        const userId = typeof parsed?.userId === 'string' ? parsed.userId : '';
        if (userId === DOWN_ID) {
          // Auth caído: la introspección obligatoria falla cerrado (503), nunca concede acceso.
          return sendJson(response, 500, { code: 'INTERNAL' });
        }
        return sendJson(response, 200, { active: true, role: roleFor(userId) });
      }
      if (url.includes('/users/')) {
        state.usersCalls += 1;
        state.lastUsersAuth = asSingle(incoming.headers['authorization']);
        const id = /\/users\/([^/]+)\//.exec(url)?.[1] ?? '';
        return sendJson(response, 200, {
          id,
          name: 'Ada',
          email: 'ada@stayhub.test',
          role: 'GUEST',
          version: 1,
        });
      }
      sendJson(response, 404, { code: 'NOT_FOUND' }, 'application/problem+json');
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
      state.usersCalls = 0;
      state.lastUsersAuth = undefined;
    },
    usersCalls: (): number => state.usersCalls,
    lastUsersAuth: (): string | undefined => state.lastUsersAuth,
  };
}

function asSingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
  contentType = 'application/json',
): void {
  response.writeHead(status, { 'content-type': contentType });
  response.end(JSON.stringify(payload));
}

const stub = createStub();
const { config, tls, env, servicePrivateKeyPem } = createTestGatewayConfig();
const KID = Object.keys(config.userJwt.publicKeys)[0] ?? 'stayhub-auth-2026-01';

async function mintBearer(sub: string): Promise<string> {
  const key = await importPKCS8(servicePrivateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: roleFor(sub), sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
    .setSubject(sub)
    .setIssuer(config.userJwt.issuer)
    .setAudience(config.userJwt.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(key);
}

function get(path: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const call = httpsRequest(
      { host: '127.0.0.1', port: config.port, path, method: 'GET', servername: 'localhost', ca: tls.certPem, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, json: safeParse(raw) }));
      },
    );
    call.on('error', reject);
    call.end();
  });
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function codeOf(reply: Reply): unknown {
  return ((reply.json ?? {}) as Record<string, unknown>)['status'];
}

describe('Pipeline de autorización de perfil (GW-054)', () => {
  let app: INestApplication;
  const originalEnv = process.env;

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

  beforeEach(() => stub.reset());

  it('Passport corta primero: sin bearer → 401 y Users no se contacta', async () => {
    const reply = await get(`/api/v1/users/${OWNER_ID}/profile`);

    expect(reply.status).toBe(401);
    expect(stub.usersCalls()).toBe(0);
  });

  it('Passport corta: bearer inválido → 401 y Users no se contacta', async () => {
    const reply = await get(`/api/v1/users/${OWNER_ID}/profile`, { authorization: 'Bearer not-a-jwt' });

    expect(reply.status).toBe(401);
    expect(stub.usersCalls()).toBe(0);
  });

  it('precedencia 401 → 403: sin bearer sobre perfil ajeno → 401 (no 403)', async () => {
    const reply = await get(`/api/v1/users/${OTHER_ID}/profile`);

    expect(reply.status).toBe(401);
    expect(stub.usersCalls()).toBe(0);
  });

  it('ownership corta antes de Users: dueño válido sobre perfil ajeno → 403 sin contactar Users', async () => {
    const bearer = await mintBearer(OWNER_ID);
    const reply = await get(`/api/v1/users/${OTHER_ID}/profile`, { authorization: `Bearer ${bearer}` });

    expect(reply.status).toBe(403);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
    expect(codeOf(reply)).toBe(403);
    expect(stub.usersCalls()).toBe(0);
  });

  it('introspección obligatoria fallo cerrado: Auth caído → 503 sin contactar Users', async () => {
    const bearer = await mintBearer(DOWN_ID);
    const reply = await get(`/api/v1/users/${DOWN_ID}/profile`, { authorization: `Bearer ${bearer}` });

    expect(reply.status).toBe(503);
    expect(stub.usersCalls()).toBe(0);
  });

  it('routing feliz: dueño válido sobre su propio perfil → 200 y Users recibe el bearer validado', async () => {
    const bearer = await mintBearer(OWNER_ID);
    const reply = await get(`/api/v1/users/${OWNER_ID}/profile`, { authorization: `Bearer ${bearer}` });

    expect(reply.status).toBe(200);
    expect(stub.usersCalls()).toBe(1);
    expect(stub.lastUsersAuth()).toBe(`Bearer ${bearer}`);
  });
});
