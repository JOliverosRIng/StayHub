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

import { startGateway } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-023 — Contrato de `POST /api/v1/auth/register` alineado con
 * `specs/001-fundamentos-identidad/contracts/openapi-public.yaml`.
 *
 * Test-first: la ruta todavía no existe (se implementa en GW-026–GW-029), por lo que este
 * spec DEBE quedar en rojo. El Gateway responde 404 (Problem Details del filtro global) a cada
 * petición; cada caso afirma el estado del contrato final (201/400/409/429/503), de modo que la
 * discrepancia observada es "ruta/comportamiento ausente", no un fallo de sintaxis ni de harness.
 *
 * Auth se sustituye por un stub HTTP local (no se depende del servicio Auth real).
 */

const REGISTER_PATH = '/api/v1/auth/register';
const CONFLICT_EMAIL = 'taken@stayhub.test';
const UNAVAILABLE_EMAIL = 'down@stayhub.test';
const PROBLEM_FIELDS = ['type', 'title', 'detail', 'instance', 'code'] as const;

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
  lastRawBody(): string | undefined;
  reset(): void;
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Ada Lovelace',
    email: `ada-${randomUUID()}@stayhub.test`,
    password: 'correct horse',
    role: 'GUEST',
    ...overrides,
  };
}

function createAuthStub(): AuthStub {
  const state: { lastRawBody: string | undefined } = { lastRawBody: undefined };

  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    let raw = '';
    incoming.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    incoming.on('end', () => {
      state.lastRawBody = raw;
      const email = readEmail(raw);
      if (email === CONFLICT_EMAIL) {
        sendJson(response, 409, 'application/problem+json', { code: 'EMAIL_ALREADY_REGISTERED' });
        return;
      }
      if (email === UNAVAILABLE_EMAIL) {
        sendJson(response, 503, 'application/problem+json', { code: 'AUTH_UNAVAILABLE' });
        return;
      }
      sendJson(response, 201, 'application/json', {
        id: randomUUID(),
        name: 'Ada Lovelace',
        email: email ?? 'ada@stayhub.test',
        role: 'GUEST',
      });
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
    lastRawBody: (): string | undefined => state.lastRawBody,
    reset: (): void => {
      state.lastRawBody = undefined;
    },
  };
}

function readEmail(raw: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const email = (parsed as Record<string, unknown>)['email'];
      return typeof email === 'string' ? email : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
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

const stub = createAuthStub();
const { config, tls, env } = createTestGatewayConfig();

function post(headers: Record<string, string>, body: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const call = httpsRequest(
      {
        host: '127.0.0.1',
        port: config.port,
        path: REGISTER_PATH,
        method: 'POST',
        servername: 'localhost',
        ca: tls.certPem,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: raw,
            json: safeParse(raw),
          });
        });
      },
    );
    call.on('error', reject);
    call.write(body);
    call.end();
  });
}

function register(
  body: Record<string, unknown>,
  key: string | undefined = randomUUID(),
): Promise<Reply> {
  const headers = key === undefined ? {} : { 'idempotency-key': key };
  return post(headers, JSON.stringify(body));
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function expectProblemDetails(reply: Reply, status: number): void {
  expect(reply.status).toBe(status);
  expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  const body = (reply.json ?? {}) as Record<string, unknown>;
  expect(body['status']).toBe(status);
  expect(typeof body['traceId']).toBe('string');
  expect(body['traceId']).not.toBe('');
  for (const field of PROBLEM_FIELDS) {
    expect(typeof body[field]).toBe('string');
  }
}

async function clearEdgeCounters(): Promise<void> {
  if (REDIS_URL === undefined) return;
  const client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    const keys = await client.keys(`${config.redis.namespace}:*`);
    if (keys.length > 0) await client.del(...keys);
  } catch {
    // Redis ausente en este entorno: la aislación entre casos es best-effort.
  } finally {
    client.disconnect();
  }
}

describe('Contrato POST /api/v1/auth/register (GW-023)', () => {
  let app: INestApplication;
  const originalEnv = process.env;

  beforeAll(async () => {
    await stub.listen();
    process.env = {
      ...originalEnv,
      ...env,
      GATEWAY_AUTH_BASE_URL: stub.baseUrl(),
      GATEWAY_USERS_BASE_URL: stub.baseUrl(),
      // Redis de borde rápido de fallar cuando no hay uno de pruebas dedicado.
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
    stub.reset();
    await clearEdgeCounters();
  });

  describe('Idempotency-Key', () => {
    it('acepta un registro válido con Idempotency-Key UUID y responde 201 UserSummary', async () => {
      const reply = await register(validBody());

      expect(reply.status).toBe(201);
      const body = (reply.json ?? {}) as Record<string, unknown>;
      expect(typeof body['id']).toBe('string');
      expect(typeof body['name']).toBe('string');
      expect(typeof body['email']).toBe('string');
      expect(['GUEST', 'OWNER', 'ADMIN']).toContain(body['role']);
    });

    it('rechaza con 400 la ausencia del header Idempotency-Key', async () => {
      const reply = await register(validBody(), undefined);

      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 un Idempotency-Key que no es UUID', async () => {
      const reply = await register(validBody(), 'no-es-uuid');

      expectProblemDetails(reply, 400);
    });
  });

  describe('Contraseña (8–128, sin transformación)', () => {
    it('rechaza con 400 una contraseña de 7 caracteres', async () => {
      const reply = await register(validBody({ password: 'a'.repeat(7) }));

      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 una contraseña de 129 caracteres', async () => {
      const reply = await register(validBody({ password: 'a'.repeat(129) }));

      expectProblemDetails(reply, 400);
    });

    it('acepta exactamente 8 caracteres, incluidos espacios, sin recortar', async () => {
      const reply = await register(validBody({ password: ' '.repeat(8) }));

      expect(reply.status).toBe(201);
    });

    it('reenvía la contraseña verbatim a Auth, sin trim ni normalización', async () => {
      const password = '  MiXeD passWORD  ';
      await register(validBody({ password }));

      expect(stub.lastRawBody() ?? '').toContain(password);
    });
  });

  describe('Rol público', () => {
    it('acepta OWNER y responde 201', async () => {
      const reply = await register(validBody({ role: 'OWNER' }));

      expect(reply.status).toBe(201);
    });

    it('rechaza con 400 el rol ADMIN', async () => {
      const reply = await register(validBody({ role: 'ADMIN' }));

      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 un rol desconocido', async () => {
      const reply = await register(validBody({ role: 'SUPERUSER' }));

      expectProblemDetails(reply, 400);
    });
  });

  describe('DTO cerrado', () => {
    it('rechaza con 400 un campo desconocido', async () => {
      const reply = await register(validBody({ nickname: 'ada' }));

      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 la ausencia de un campo requerido', async () => {
      const body = validBody();
      delete body['email'];
      const reply = await register(body);

      expectProblemDetails(reply, 400);
    });

    it('rechaza con 400 un cuerpo que no es un objeto JSON', async () => {
      // Un arreglo pasa el body-parser de Express, de modo que el rechazo lo hace el DTO cerrado
      // de la ruta (no un 400 pre-routing), manteniendo el caso rojo por ruta ausente.
      const reply = await post({ 'idempotency-key': randomUUID() }, '[]');

      expectProblemDetails(reply, 400);
    });
  });

  describe('Estados remotos preservados como Problem Details + traceId', () => {
    it('mapea el conflicto de Auth a 409', async () => {
      const reply = await register(validBody({ email: CONFLICT_EMAIL }));

      expectProblemDetails(reply, 409);
    });

    it('mapea la indisponibilidad de Auth a 503', async () => {
      const reply = await register(validBody({ email: UNAVAILABLE_EMAIL }));

      expectProblemDetails(reply, 503);
    });

    it('devuelve 429 con Retry-After al exceder el límite por origen', async () => {
      const replies: Reply[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        replies.push(await register(validBody()));
      }

      const limited = replies.find((reply) => reply.status === 429);
      expect(limited).toBeDefined();
      if (limited !== undefined) {
        expectProblemDetails(limited, 429);
        expect(limited.headers['retry-after']).toBeDefined();
      }
    });
  });
});
