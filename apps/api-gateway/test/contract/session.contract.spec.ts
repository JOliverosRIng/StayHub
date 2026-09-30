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
import Redis from 'ioredis';
import { SignJWT, importPKCS8 } from 'jose';

import { startGateway } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-031 — Contrato de sesión (`/auth/login`, `/auth/refresh`, `/auth/validate`) alineado con
 * `contracts/openapi-public.yaml` (FR-007–FR-013).
 *
 * Test-first: las rutas se implementan en GW-035–GW-041, por lo que este spec DEBE quedar en
 * rojo. El Gateway responde 404 a cada petición; cada caso afirma el estado del contrato final
 * (200/400/401/429/503), de modo que la discrepancia observada es "ruta ausente", no un fallo de
 * sintaxis ni de harness. Auth se sustituye por un stub HTTP local.
 */

const LOGIN_PATH = '/api/v1/auth/login';
const REFRESH_PATH = '/api/v1/auth/refresh';
const VALIDATE_PATH = '/api/v1/auth/validate';
const REFRESH_COOKIE = 'stayhub_refresh';
const PROBLEM_FIELDS = ['type', 'title', 'detail', 'instance', 'code'] as const;

const WRONG_EMAIL = 'wrong@stayhub.test';
const NONEXISTENT_EMAIL = 'ghost@stayhub.test';
const DOWN_EMAIL = 'down@stayhub.test';
const VALID_REFRESH = 'valid-refresh-token-0000000000000000';
const REUSED_REFRESH = 'reused-refresh-token-000000000000000';
const DOWN_REFRESH = 'down-refresh-token-00000000000000000';
const DOWN_SID = '00000000-0000-4000-8000-0000000000d0';
const INACTIVE_SID = '00000000-0000-4000-8000-0000000000ac';

const REDIS_URL = process.env['GATEWAY_TEST_REDIS_URL'];

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
  readonly json: unknown;
}

interface AuthStub {
  readonly server: Server;
  listen(): Promise<void>;
  baseUrl(): string;
}

function internalTokenPair(): Record<string, unknown> {
  return {
    accessToken: 'access.jwt.token',
    refreshToken: 'rotated-refresh-token-0000000000000000',
    expiresIn: 3600,
    absoluteExpiresAt: '2026-10-07T00:00:00.000Z',
    principal: {
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      role: 'GUEST',
    },
  };
}

function createAuthStub(): AuthStub {
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    let raw = '';
    incoming.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    incoming.on('end', () => {
      const url = incoming.url ?? '';
      const body = parseJson(raw);
      if (url.includes('/login')) return handleLogin(response, body);
      if (url.includes('/sessions/refresh')) return handleRefresh(response, body);
      if (url.includes('/sessions/validate')) return handleValidate(response, body);
      return sendJson(response, 404, 'application/problem+json', { code: 'NOT_FOUND' });
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
  };
}

function handleLogin(response: ServerResponse, body: Record<string, unknown>): void {
  const email = typeof body['email'] === 'string' ? body['email'] : '';
  if (email === DOWN_EMAIL) {
    sendJson(response, 503, 'application/problem+json', { code: 'AUTH_UNAVAILABLE' });
    return;
  }
  if (email === WRONG_EMAIL || email === NONEXISTENT_EMAIL) {
    sendJson(response, 401, 'application/problem+json', { code: 'INVALID_CREDENTIALS' });
    return;
  }
  sendJson(response, 200, 'application/json', internalTokenPair());
}

function handleRefresh(response: ServerResponse, body: Record<string, unknown>): void {
  const token = typeof body['refreshToken'] === 'string' ? body['refreshToken'] : '';
  if (token === DOWN_REFRESH) {
    sendJson(response, 503, 'application/problem+json', { code: 'AUTH_UNAVAILABLE' });
    return;
  }
  if (token === REUSED_REFRESH) {
    sendJson(response, 401, 'application/problem+json', { code: 'REFRESH_REUSED' });
    return;
  }
  sendJson(response, 200, 'application/json', internalTokenPair());
}

function handleValidate(response: ServerResponse, body: Record<string, unknown>): void {
  const sessionId = typeof body['sessionId'] === 'string' ? body['sessionId'] : '';
  if (sessionId === DOWN_SID) {
    sendJson(response, 503, 'application/problem+json', { code: 'AUTH_UNAVAILABLE' });
    return;
  }
  if (sessionId === INACTIVE_SID) {
    sendJson(response, 401, 'application/problem+json', { code: 'SESSION_INACTIVE' });
    return;
  }
  sendJson(response, 200, 'application/json', { active: true, role: 'GUEST' });
}

function sendJson(
  response: ServerResponse,
  status: number,
  contentType: string,
  payload: Record<string, unknown>,
): void {
  response.writeHead(status, { 'content-type': contentType });
  response.end(JSON.stringify(payload));
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const stub = createAuthStub();
const { config, tls, env, servicePrivateKeyPem } = createTestGatewayConfig();
const USER_JWT_KID = Object.keys(config.userJwt.publicKeys)[0] ?? 'stayhub-auth-2026-01';

async function mintUserJwt(overrides: { sid?: string; role?: string } = {}): Promise<string> {
  const key = await importPKCS8(servicePrivateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: overrides.role ?? 'GUEST', sid: overrides.sid ?? randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: USER_JWT_KID, typ: 'JWT' })
    .setSubject('33333333-3333-4333-8333-333333333333')
    .setIssuer(config.userJwt.issuer)
    .setAudience(config.userJwt.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(key);
}

function request(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const call = httpsRequest(
      {
        host: '127.0.0.1',
        port: config.port,
        path,
        method,
        servername: 'localhost',
        ca: tls.certPem,
        headers: { 'content-type': 'application/json', ...options.headers },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: raw, json: parseJson(raw) }),
        );
      },
    );
    call.on('error', reject);
    if (options.body !== undefined) call.write(options.body);
    call.end();
  });
}

function record(reply: Reply): Record<string, unknown> {
  return (reply.json ?? {}) as Record<string, unknown>;
}

function expectProblemDetails(reply: Reply, status: number): void {
  expect(reply.status).toBe(status);
  expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  const body = record(reply);
  expect(body['status']).toBe(status);
  expect(typeof body['traceId']).toBe('string');
  for (const field of PROBLEM_FIELDS) {
    expect(typeof body[field]).toBe('string');
  }
}

function setCookie(reply: Reply): string {
  const raw = reply.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`)) ?? '';
}

async function clearEdgeCounters(): Promise<void> {
  if (REDIS_URL === undefined) return;
  const client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    const keys = await client.keys(`${config.redis.namespace}:*`);
    if (keys.length > 0) await client.del(...keys);
  } catch {
    // Redis ausente: aislación best-effort.
  } finally {
    client.disconnect();
  }
}

describe('Contrato de sesión (GW-031)', () => {
  let app: INestApplication;
  const originalEnv = process.env;

  beforeAll(async () => {
    await stub.listen();
    process.env = {
      ...originalEnv,
      ...env,
      GATEWAY_AUTH_BASE_URL: stub.baseUrl(),
      GATEWAY_USERS_BASE_URL: stub.baseUrl(),
      GATEWAY_REDIS_URL: REDIS_URL ?? 'redis://127.0.0.1:56399',
    };
    app = await startGateway(config);
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => stub.server.close(() => resolve()));
    process.env = originalEnv;
  });

  beforeEach(async () => {
    await clearEdgeCounters();
  });

  const credentials = (email: string): string =>
    JSON.stringify({ email, password: 'correct horse' });

  describe('POST /auth/login', () => {
    it('emite access token de 1h y refresh como cookie segura, sin exponer el refresh en el cuerpo', async () => {
      const reply = await request('POST', LOGIN_PATH, { body: credentials('ada@stayhub.test') });

      expect(reply.status).toBe(200);
      const body = record(reply);
      expect(typeof body['accessToken']).toBe('string');
      expect(body['tokenType']).toBe('Bearer');
      expect(body['expiresIn']).toBe(3600);
      const user = body['user'] as Record<string, unknown> | undefined;
      expect(typeof user?.['userId']).toBe('string');
      expect(typeof user?.['sessionId']).toBe('string');
      expect(typeof user?.['role']).toBe('string');

      const cookie = setCookie(reply);
      expect(cookie).toContain(`${REFRESH_COOKIE}=`);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=/i);

      expect(body['refreshToken']).toBeUndefined();
      expect(reply.body).not.toContain('rotated-refresh-token');
    });

    it('rechaza con 400 un cuerpo con campos desconocidos', async () => {
      const reply = await request('POST', LOGIN_PATH, {
        body: JSON.stringify({ email: 'ada@stayhub.test', password: 'correct horse', remember: true }),
      });

      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 la ausencia de un campo requerido', async () => {
      const reply = await request('POST', LOGIN_PATH, {
        body: JSON.stringify({ email: 'ada@stayhub.test' }),
      });

      expectProblemDetails(reply, 400);
    });

    it('devuelve 401 con credenciales inválidas', async () => {
      const reply = await request('POST', LOGIN_PATH, { body: credentials(WRONG_EMAIL) });

      expectProblemDetails(reply, 401);
    });

    it('no permite enumerar cuentas: credencial inválida y cuenta inexistente son idénticas', async () => {
      const wrong = await request('POST', LOGIN_PATH, { body: credentials(WRONG_EMAIL) });
      const ghost = await request('POST', LOGIN_PATH, { body: credentials(NONEXISTENT_EMAIL) });

      expect(wrong.status).toBe(401);
      expect(ghost.status).toBe(401);
      expect(record(wrong)['code']).toBe(record(ghost)['code']);
      expect(record(wrong)['detail']).toBe(record(ghost)['detail']);
    });

    it('aplica el límite por origen con 429 y Retry-After', async () => {
      const replies: Reply[] = [];
      for (let attempt = 0; attempt < 32; attempt += 1) {
        replies.push(await request('POST', LOGIN_PATH, { body: credentials('ada@stayhub.test') }));
      }

      const limited = replies.find((reply) => reply.status === 429);
      expect(limited).toBeDefined();
      if (limited !== undefined) {
        expectProblemDetails(limited, 429);
        expect(limited.headers['retry-after']).toBeDefined();
      }
    });

    it('devuelve 503 cuando Auth no está disponible', async () => {
      const reply = await request('POST', LOGIN_PATH, { body: credentials(DOWN_EMAIL) });

      expectProblemDetails(reply, 503);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rota el refresh vía cookie y responde 200 sin exponer el token en el cuerpo', async () => {
      const reply = await request('POST', REFRESH_PATH, {
        headers: { cookie: `${REFRESH_COOKIE}=${VALID_REFRESH}` },
      });

      expect(reply.status).toBe(200);
      expect(typeof record(reply)['accessToken']).toBe('string');
      expect(record(reply)['refreshToken']).toBeUndefined();
      expect(setCookie(reply)).toContain(`${REFRESH_COOKIE}=`);
    });

    it('devuelve 401 cuando no hay cookie de refresh', async () => {
      const reply = await request('POST', REFRESH_PATH, {});

      expectProblemDetails(reply, 401);
    });

    it('reutilizar el refresh obliga a un nuevo login (401)', async () => {
      const reply = await request('POST', REFRESH_PATH, {
        headers: { cookie: `${REFRESH_COOKIE}=${REUSED_REFRESH}` },
      });

      expectProblemDetails(reply, 401);
    });

    it('ignora un refresh enviado en el cuerpo público: sin cookie es 401', async () => {
      const reply = await request('POST', REFRESH_PATH, {
        body: JSON.stringify({ refreshToken: VALID_REFRESH }),
      });

      expectProblemDetails(reply, 401);
    });

    it('devuelve 503 cuando Auth no está disponible', async () => {
      const reply = await request('POST', REFRESH_PATH, {
        headers: { cookie: `${REFRESH_COOKIE}=${DOWN_REFRESH}` },
      });

      expectProblemDetails(reply, 503);
    });
  });

  describe('GET /auth/validate', () => {
    it('valida la sesión con bearer y devuelve una proyección mínima', async () => {
      const bearer = await mintUserJwt();
      const reply = await request('GET', VALIDATE_PATH, {
        headers: { authorization: `Bearer ${bearer}` },
      });

      expect(reply.status).toBe(200);
      const body = record(reply);
      expect(typeof body['userId']).toBe('string');
      expect(typeof body['sessionId']).toBe('string');
      expect(typeof body['role']).toBe('string');
      expect(body['email']).toBeUndefined();
      expect(body['name']).toBeUndefined();
      expect(body['accessToken']).toBeUndefined();
    });

    it('devuelve 401 sin cabecera Authorization', async () => {
      const reply = await request('GET', VALIDATE_PATH, {});

      expectProblemDetails(reply, 401);
    });

    it('devuelve 401 con un bearer inválido', async () => {
      const reply = await request('GET', VALIDATE_PATH, {
        headers: { authorization: 'Bearer no-es-un-jwt' },
      });

      expectProblemDetails(reply, 401);
    });

    it('devuelve 503 cuando la introspección de Auth no está disponible', async () => {
      const bearer = await mintUserJwt({ sid: DOWN_SID });
      const reply = await request('GET', VALIDATE_PATH, {
        headers: { authorization: `Bearer ${bearer}` },
      });

      expectProblemDetails(reply, 503);
    });
  });
});
