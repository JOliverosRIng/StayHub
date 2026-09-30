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
 * GW-043 — Contrato de perfil y foto (US3), alineado con `contracts/openapi-public.yaml`
 * (RQ-01, FR-014–FR-019, FR-023).
 *
 * Test-first: las rutas se implementan en GW-046–GW-048 (ownership en GW-053), por lo que este
 * spec DEBE quedar en rojo. El Gateway responde 404 a cada petición (ruta ausente); cada caso
 * afirma el estado del contrato final, de modo que la discrepancia es "ruta ausente", no un fallo
 * de sintaxis ni de harness. Auth (introspección) y Users se sustituyen por stubs HTTP locales.
 *
 * El límite de la foto es EXACTAMENTE 5.000.000 bytes decimales (no 5 MiB): 5.000.000 se acepta y
 * 5.000.001 devuelve 413.
 */

const PHOTO_LIMIT_BYTES = 5_000_000;
const PROBLEM_FIELDS = ['type', 'title', 'detail', 'instance', 'code'] as const;

const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '20000000-0000-4000-8000-000000000002';
const NOT_FOUND_ID = '30000000-0000-4000-8000-000000000003';
const DOWN_ID = '40000000-0000-4000-8000-000000000004';
const CONFLICT_ID = '50000000-0000-4000-8000-000000000005';

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
  readonly raw: Buffer;
  readonly json: unknown;
}

function profileFor(userId: string): Record<string, unknown> {
  return {
    id: userId,
    name: 'Ada Lovelace',
    email: 'ada@stayhub.test',
    role: 'GUEST',
    phone: '+14155550123',
    preferences: { theme: 'dark' },
    photoUrl: null,
    version: 1,
  };
}

function usersReply(method: string, url: string, response: ServerResponse): void {
  const userId = /\/users\/([^/]+)\//.exec(url)?.[1] ?? '';
  if (userId === DOWN_ID) return sendJson(response, 503, 'application/problem+json', { code: 'USERS_UNAVAILABLE' });
  if (userId === NOT_FOUND_ID) return sendJson(response, 404, 'application/problem+json', { code: 'PROFILE_NOT_FOUND' });
  if (userId === CONFLICT_ID && method === 'PATCH') {
    return sendJson(response, 409, 'application/problem+json', { code: 'PROFILE_VERSION_CONFLICT' });
  }
  if (url.includes('/photo')) {
    response.writeHead(200, { 'content-type': 'image/jpeg' });
    response.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
    return;
  }
  sendJson(response, 200, 'application/json', profileFor(userId));
}

function createStub(): { server: Server; listen(): Promise<void>; baseUrl(): string } {
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    incoming.on('data', () => undefined);
    incoming.on('end', () => {
      const url = incoming.url ?? '';
      const method = incoming.method ?? 'GET';
      if (url.includes('/sessions/validate')) {
        return sendJson(response, 200, 'application/json', { active: true, role: 'GUEST' });
      }
      if (url.includes('/users/')) return usersReply(method, url, response);
      sendJson(response, 404, 'application/problem+json', { code: 'NOT_FOUND' });
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

function sendJson(
  response: ServerResponse,
  status: number,
  contentType: string,
  payload: Record<string, unknown>,
): void {
  response.writeHead(status, { 'content-type': contentType });
  response.end(JSON.stringify(payload));
}

const stub = createStub();
const { config, tls, env, servicePrivateKeyPem } = createTestGatewayConfig();
const USER_JWT_KID = Object.keys(config.userJwt.publicKeys)[0] ?? 'stayhub-auth-2026-01';

async function mintBearer(sub: string, role = 'GUEST'): Promise<string> {
  const key = await importPKCS8(servicePrivateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role, sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: USER_JWT_KID, typ: 'JWT' })
    .setSubject(sub)
    .setIssuer(config.userJwt.issuer)
    .setAudience(config.userJwt.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(key);
}

interface RequestOptions {
  readonly bearer?: string;
  readonly contentType?: string;
  readonly body?: Buffer;
}

function send(method: string, path: string, options: RequestOptions = {}): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.bearer !== undefined) headers['authorization'] = `Bearer ${options.bearer}`;
  if (options.contentType !== undefined) headers['content-type'] = options.contentType;
  if (options.body !== undefined) headers['content-length'] = String(options.body.length);

  return new Promise((resolve, reject) => {
    const call = httpsRequest(
      { host: '127.0.0.1', port: config.port, path, method, servername: 'localhost', ca: tls.certPem, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const body = raw.toString('utf8');
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body, raw, json: safeParse(body) });
        });
      },
    );
    call.on('error', reject);
    if (options.body !== undefined) call.write(options.body);
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

const BOUNDARY = 'stayhubGW043Boundary';

function multipart(profileJson: string, photo?: { bytes: Buffer; contentType: string }): Buffer {
  const parts: Buffer[] = [
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="profile"\r\nContent-Type: application/json\r\n\r\n${profileJson}\r\n`,
    ),
  ];
  if (photo !== undefined) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="photo"; filename="photo"\r\nContent-Type: ${photo.contentType}\r\n\r\n`,
      ),
      photo.bytes,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(parts);
}

function jpegOfSize(size: number): Buffer {
  const buffer = Buffer.alloc(size, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  buffer[3] = 0xe0;
  buffer[size - 2] = 0xff;
  buffer[size - 1] = 0xd9;
  return buffer;
}

function patch(userId: string, bearer: string, profileJson: string, photo?: { bytes: Buffer; contentType: string }): Promise<Reply> {
  return send('PATCH', `/api/v1/users/${userId}/profile`, {
    bearer,
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
    body: multipart(profileJson, photo),
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

describe('Contrato de perfil y foto (GW-043)', () => {
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

  describe('GET /users/{userId}/profile', () => {
    it('devuelve 200 con el perfil para un bearer válido del propio usuario', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await send('GET', `/api/v1/users/${OWNER_ID}/profile`, { bearer });

      expect(reply.status).toBe(200);
      const body = record(reply);
      expect(body['id']).toBe(OWNER_ID);
      expect(typeof body['name']).toBe('string');
      expect(typeof body['email']).toBe('string');
      expect(typeof body['version']).toBe('number');
    });

    it('rechaza con 401 la ausencia de bearer', async () => {
      const reply = await send('GET', `/api/v1/users/${OWNER_ID}/profile`);
      expectProblemDetails(reply, 401);
    });

    it('rechaza con 401 un bearer inválido', async () => {
      const reply = await send('GET', `/api/v1/users/${OWNER_ID}/profile`, { bearer: 'no-es-un-jwt' });
      expectProblemDetails(reply, 401);
    });

    it('rechaza con 403 el acceso al perfil de otro usuario', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await send('GET', `/api/v1/users/${OTHER_ID}/profile`, { bearer });
      expectProblemDetails(reply, 403);
    });

    it('preserva el 404 de Users conservando su código de perfil ausente', async () => {
      const bearer = await mintBearer(NOT_FOUND_ID);
      const reply = await send('GET', `/api/v1/users/${NOT_FOUND_ID}/profile`, { bearer });

      expectProblemDetails(reply, 404);
      expect(record(reply)['code']).toBe('PROFILE_NOT_FOUND');
    });

    it('falla cerrado con 503 cuando Users no está disponible', async () => {
      const bearer = await mintBearer(DOWN_ID);
      const reply = await send('GET', `/api/v1/users/${DOWN_ID}/profile`, { bearer });
      expectProblemDetails(reply, 503);
    });
  });

  describe('PATCH /users/{userId}/profile', () => {
    it('acepta la edición de campos permitidos y responde 200', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1, name: 'Grace Hopper' }));
      expect(reply.status).toBe(200);
    });

    it('acepta null para eliminar un opcional (teléfono) y responde 200', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1, phone: null }));
      expect(reply.status).toBe(200);
    });

    it('rechaza con 400 un campo desconocido en el perfil', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1, nickname: 'ada' }));
      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 un teléfono que no es E.164', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1, phone: '555-1234' }));
      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 más de 20 preferencias', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const preferences: Record<string, number> = {};
      for (let index = 0; index < 21; index += 1) preferences[`k${index}`] = index;
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1, preferences }));
      expectProblemDetails(reply, 400);
    });

    it('preserva el 409 de conflicto de versión', async () => {
      const bearer = await mintBearer(CONFLICT_ID);
      const reply = await patch(CONFLICT_ID, bearer, JSON.stringify({ expectedVersion: 1, name: 'Grace Hopper' }));
      expectProblemDetails(reply, 409);
    });

    it('acepta una foto de exactamente 5.000.000 bytes', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1 }), {
        bytes: jpegOfSize(PHOTO_LIMIT_BYTES),
        contentType: 'image/jpeg',
      });
      expect(reply.status).toBe(200);
    });

    it('rechaza con 413 una foto de 5.000.001 bytes', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1 }), {
        bytes: jpegOfSize(PHOTO_LIMIT_BYTES + 1),
        contentType: 'image/jpeg',
      });
      expectProblemDetails(reply, 413);
    });

    it('rechaza con 415 una foto que no es JPEG ni PNG', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await patch(OWNER_ID, bearer, JSON.stringify({ expectedVersion: 1 }), {
        bytes: Buffer.from('esto no es una imagen'),
        contentType: 'text/plain',
      });
      expectProblemDetails(reply, 415);
    });
  });

  describe('GET /users/{userId}/profile/photo', () => {
    it('descarga la foto del propio usuario con 200', async () => {
      const bearer = await mintBearer(OWNER_ID);
      const reply = await send('GET', `/api/v1/users/${OWNER_ID}/profile/photo`, { bearer });

      expect(reply.status).toBe(200);
      expect(String(reply.headers['content-type'])).toMatch(/image\/(jpeg|png)/);
    });

    it('rechaza con 401 la descarga sin bearer', async () => {
      const reply = await send('GET', `/api/v1/users/${OWNER_ID}/profile/photo`);
      expectProblemDetails(reply, 401);
    });
  });
});
