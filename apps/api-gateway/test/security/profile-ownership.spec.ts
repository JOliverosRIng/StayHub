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
 * GW-051 — Ownership del perfil (FR-020–FR-021, SC-004).
 *
 * Test-first: el ownership guard se implementa en GW-053, por lo que este spec DEBE quedar en rojo.
 * Sin ese guard, el Gateway (protegido solo por autenticación de GW-040) reenvía a Users cualquier
 * `userId` del path, así que un acceso a perfil ajeno NO devuelve 403 y SÍ contacta a Users. Las
 * aserciones (403 + Users no invocado) fallan por endurecimiento ausente, no por harness: typecheck
 * y lint quedan verdes, y el Gateway arranca con los stubs. Cuando GW-053 aplique
 * `principal.sub == route.userId` antes de Users, estas pruebas pasarán a verde.
 */

const PROBLEM_FIELDS = ['type', 'title', 'detail', 'instance', 'code'] as const;

const OWNER_ID = '11111111-1111-4111-8111-111111111111'; // bearer GUEST
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'; // bearer ADMIN
const OTHER_EXISTING_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MISSING_ID = '44444444-4444-4444-8444-444444444444';

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
}

function profileFor(userId: string): Record<string, unknown> {
  return { id: userId, name: 'Ada', email: 'ada@stayhub.test', role: 'GUEST', version: 1 };
}

function roleFor(userId: string): string {
  return userId === ADMIN_ID ? 'ADMIN' : 'GUEST';
}

function createStub(): Stub {
  const state = { usersCalls: 0 };
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const url = incoming.url ?? '';
      if (url.includes('/sessions/validate')) {
        // La introspección debe devolver el MISMO rol del bearer para que el guard de GW-040
        // supere la coherencia de rol (si no, sería 401 y nunca se alcanzaría el ownership).
        const parsed = safeParse(Buffer.concat(chunks).toString()) as { userId?: string } | undefined;
        const userId = typeof parsed?.userId === 'string' ? parsed.userId : '';
        return sendJson(response, 200, { active: true, role: roleFor(userId) });
      }
      if (url.includes('/users/')) {
        state.usersCalls += 1;
        const id = /\/users\/([^/]+)\//.exec(url)?.[1] ?? '';
        if (id === OTHER_MISSING_ID) {
          return sendJson(response, 404, { code: 'PROFILE_NOT_FOUND' }, 'application/problem+json');
        }
        return sendJson(response, 200, profileFor(id));
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
    },
    usersCalls: (): number => state.usersCalls,
  };
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

async function mintBearer(sub: string, role: string): Promise<string> {
  const key = await importPKCS8(servicePrivateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role, sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
    .setSubject(sub)
    .setIssuer(config.userJwt.issuer)
    .setAudience(config.userJwt.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(key);
}

function get(path: string, bearer: string): Promise<Reply> {
  return send('GET', path, bearer);
}

function send(method: string, path: string, bearer: string, body?: Buffer, contentType?: string): Promise<Reply> {
  const headers: Record<string, string> = { authorization: `Bearer ${bearer}` };
  if (contentType !== undefined) headers['content-type'] = contentType;
  if (body !== undefined) headers['content-length'] = String(body.length);
  return new Promise((resolve, reject) => {
    const call = httpsRequest(
      { host: '127.0.0.1', port: config.port, path, method, servername: 'localhost', ca: tls.certPem, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, json: safeParse(raw) }));
      },
    );
    call.on('error', reject);
    if (body !== undefined) call.write(body);
    call.end();
  });
}

function patchProfile(path: string, bearer: string): Promise<Reply> {
  const boundary = 'ownershipBoundary';
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="profile"\r\nContent-Type: application/json\r\n\r\n{"expectedVersion":1,"name":"Grace Hopper"}\r\n--${boundary}--\r\n`,
  );
  return send('PATCH', path, bearer, body, `multipart/form-data; boundary=${boundary}`);
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function record(reply: Reply): Record<string, unknown> {
  return (reply.json ?? {}) as Record<string, unknown>;
}

function expectForbidden(reply: Reply): void {
  expect(reply.status).toBe(403);
  expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  const body = record(reply);
  expect(body['status']).toBe(403);
  expect(typeof body['traceId']).toBe('string');
  for (const field of PROBLEM_FIELDS) {
    expect(typeof body[field]).toBe('string');
  }
}

describe('Ownership del perfil (GW-051)', () => {
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

  it('GET a perfil ajeno existente devuelve 403 y NO contacta a Users', async () => {
    const bearer = await mintBearer(OWNER_ID, 'GUEST');
    const reply = await get(`/api/v1/users/${OTHER_EXISTING_ID}/profile`, bearer);

    expectForbidden(reply);
    expect(stub.usersCalls()).toBe(0);
  });

  it('GET a perfil ajeno inexistente devuelve 403 sin filtrar su existencia', async () => {
    const bearer = await mintBearer(OWNER_ID, 'GUEST');

    const existing = await get(`/api/v1/users/${OTHER_EXISTING_ID}/profile`, bearer);
    stub.reset();
    const missing = await get(`/api/v1/users/${OTHER_MISSING_ID}/profile`, bearer);

    expectForbidden(missing);
    expect(stub.usersCalls()).toBe(0);
    // Existente e inexistente son indistinguibles: mismo estado y mismo código.
    expect(missing.status).toBe(existing.status);
    expect(record(missing)['code']).toBe(record(existing)['code']);
  });

  it('ADMIN no tiene privilegio implícito sobre perfiles ajenos: también 403', async () => {
    const bearer = await mintBearer(ADMIN_ID, 'ADMIN');
    const reply = await get(`/api/v1/users/${OTHER_EXISTING_ID}/profile`, bearer);

    expectForbidden(reply);
    expect(stub.usersCalls()).toBe(0);
  });

  it('PATCH a perfil ajeno devuelve 403 antes de contactar a Users', async () => {
    const bearer = await mintBearer(OWNER_ID, 'GUEST');
    const reply = await patchProfile(`/api/v1/users/${OTHER_EXISTING_ID}/profile`, bearer);

    expectForbidden(reply);
    expect(stub.usersCalls()).toBe(0);
  });
});
