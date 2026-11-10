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
import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { SignJWT, importPKCS8 } from 'jose';

import { GatewayLogger } from '@gateway/infrastructure/observability/gateway-logger';
import * as otel from '@gateway/infrastructure/observability/otel';
import { toPublicTokenResponse } from '@gateway/modules/auth/login.controller';

import { startGateway } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-062 — Auditoría de fuga de secretos en respuestas, logs y trazas (FR-024, constitución §V).
 *
 * Ejerce el Gateway real por HTTPS contra stubs locales de Auth (introspección) y Users
 * (perfil/foto) y comprueba que:
 *  - Las respuestas públicas no exponen contraseña, hash, refresh token, service JWT ni cabeceras
 *    internas; `/auth/validate` se limita a `userId`/`sessionId`/`role` y la foto no filtra metadatos
 *    de identidad.
 *  - Los logs JSON (stdout/stderr) y los registros enviados a OTLP no contienen contraseña, correo,
 *    JWT, refresh, hash, foto ni cabeceras internas.
 *  - Las trazas OTel solo llevan método, plantilla de ruta, `traceId` y estado; nunca valores de
 *    identidad ni tokens.
 *  - `toPublicTokenResponse` elimina el refresh token del cuerpo (solo viaja en cookie).
 *
 * No requiere Auth/Users reales ni Redis: usa stubs y evita las rutas con rate limit de borde.
 */

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'S3cret-passphrase-062!';
const EMAIL = 'ada.secret-062@stayhub.test';
const REFRESH_TOKEN = 'refresh-062-should-never-leak';
const SERVICE_TOKEN = 'service-jwt-062-should-never-leak';
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=1$hash-062-should-never-leak';
const PHOTO_BASE64 = 'data:image/jpeg;base64,cGhvdG8tMDYyLXNlY3JldA==';
const INVALID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciJ9.invalid-signature-062';
const INTERNAL_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-sub',
  'x-service-token',
  'x-internal-token',
  'x-forwarded-for',
] as const;

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
  readonly text: string;
  readonly json: unknown;
}

interface Stub {
  readonly server: Server;
  listen(): Promise<void>;
  baseUrl(): string;
}

function sendJson(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function createStub(): Stub {
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    incoming.on('data', () => undefined);
    incoming.on('end', () => {
      const url = incoming.url ?? '';
      if (url.includes('/sessions/validate')) {
        sendJson(response, 200, { active: true, role: 'GUEST' });
        return;
      }
      if (url.includes('/profile/photo')) {
        response.writeHead(200, { 'content-type': 'image/jpeg' });
        response.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x06, 0x02]));
        return;
      }
      if (url.includes('/profile')) {
        sendJson(response, 200, {
          id: OWNER_ID,
          name: 'Ada Lovelace',
          email: EMAIL,
          role: 'GUEST',
          version: 1,
        });
        return;
      }
      sendJson(response, 404, { code: 'NOT_FOUND' });
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

const stub = createStub();
const { config, tls, env, servicePrivateKeyPem } = createTestGatewayConfig();
const KID = Object.keys(config.userJwt.publicKeys)[0] ?? 'stayhub-auth-2026-01';

async function mintBearer(sub: string): Promise<string> {
  const key = await importPKCS8(servicePrivateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'GUEST', sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: KID, typ: 'JWT' })
    .setSubject(sub)
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
  headers: Record<string, string> = {},
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
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks);
          const text = body.toString('utf8');
          let json: unknown;
          try {
            json = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
          } catch {
            json = undefined;
          }
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body, text, json });
        });
      },
    );
    call.on('error', reject);
    call.end();
  });
}

function captureWrites(): { restored: () => void; lines: () => string[] } {
  const written: string[] = [];
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  return {
    restored: (): void => {
      stdout.mockRestore();
      stderr.mockRestore();
    },
    lines: (): string[] => written,
  };
}

const FORBIDDEN_IN_RESPONSE = [
  PASSWORD,
  REFRESH_TOKEN,
  SERVICE_TOKEN,
  PASSWORD_HASH,
  PHOTO_BASE64,
  INVALID_TOKEN,
] as const;

function expectNoInternalHeaders(headers: IncomingHttpHeaders): void {
  for (const name of INTERNAL_HEADERS) {
    expect(headers[name]).toBeUndefined();
  }
  expect(headers['set-cookie']).toBeUndefined();
}

describe('Sin fuga de secretos en respuestas, logs y trazas (GW-062)', () => {
  const originalEnv = process.env;
  const tel = new InMemorySpanExporter();
  const provider = new BasicTracerProvider();
  const telemetry = jest.spyOn(otel, 'emitTelemetryLog').mockImplementation(() => undefined);
  const writes = captureWrites();
  let app: INestApplication;
  let bearer: string;

  beforeAll(async () => {
    provider.addSpanProcessor(new SimpleSpanProcessor(tel));
    trace.setGlobalTracerProvider(provider);
    await stub.listen();
    process.env = {
      ...originalEnv,
      ...env,
      GATEWAY_AUTH_BASE_URL: stub.baseUrl(),
      GATEWAY_USERS_BASE_URL: stub.baseUrl(),
      GATEWAY_REDIS_URL: process.env['GATEWAY_TEST_REDIS_URL'] ?? 'redis://127.0.0.1:56399',
    };
    bearer = await mintBearer(OWNER_ID);
    app = await startGateway(config);
  }, 30000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
    await new Promise<void>((resolve) => stub.server.close(() => resolve()));
    writes.restored();
    telemetry.mockRestore();
    trace.disable();
    await provider.shutdown();
    process.env = originalEnv;
  });

  it('/auth/validate responde solo la proyección mínima userId/sessionId/role', async () => {
    const reply = await request('GET', '/api/v1/auth/validate', { authorization: `Bearer ${bearer}` });

    expect(reply.status).toBe(200);
    expect(Object.keys(reply.json as Record<string, unknown>).sort()).toEqual([
      'role',
      'sessionId',
      'userId',
    ]);
    expectNoInternalHeaders(reply.headers);
    for (const secret of FORBIDDEN_IN_RESPONSE) {
      expect(reply.text).not.toContain(secret);
    }
  });

  it('401 con bearer inválido no refleja el token ni cabeceras internas', async () => {
    const reply = await request('GET', '/api/v1/auth/validate', {
      authorization: `Bearer ${INVALID_TOKEN}`,
    });

    expect(reply.status).toBe(401);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
    expect(reply.text).not.toContain(INVALID_TOKEN);
    expectNoInternalHeaders(reply.headers);
  });

  it('403 por perfil ajeno no expone identidad enviada en cabeceras', async () => {
    const other = randomUUID();
    const reply = await request('GET', `/api/v1/users/${other}/profile`, {
      authorization: `Bearer ${bearer}`,
      'x-user-id': other,
      'x-user-role': 'ADMIN',
      'x-sub': other,
      'x-service-token': SERVICE_TOKEN,
    });

    expect(reply.status).toBe(403);
    expect(reply.text).not.toContain(SERVICE_TOKEN);
    expectNoInternalHeaders(reply.headers);
  });

  it('el perfil no devuelve contraseña, hash, tokens ni cabeceras internas', async () => {
    const reply = await request('GET', `/api/v1/users/${OWNER_ID}/profile`, {
      authorization: `Bearer ${bearer}`,
    });

    expect(reply.status).toBe(200);
    expectNoInternalHeaders(reply.headers);
    for (const secret of FORBIDDEN_IN_RESPONSE) {
      expect(reply.text).not.toContain(secret);
    }
    expect(reply.text).not.toContain('password');
    expect(reply.text).not.toContain('refreshToken');
    expect(reply.text).not.toContain('serviceToken');
  });

  it('la foto se sirve sin metadatos de identidad ni cabeceras internas', async () => {
    const reply = await request('GET', `/api/v1/users/${OWNER_ID}/profile/photo`, {
      authorization: `Bearer ${bearer}`,
    });

    expect(reply.status).toBe(200);
    expect(String(reply.headers['content-type'])).toBe('image/jpeg');
    expectNoInternalHeaders(reply.headers);
    expect(reply.headers['content-disposition']).toBeUndefined();
  });

  it('los logs JSON y los registros OTLP no contienen secretos ni correo', () => {
    const logged = writes.lines().join('');
    const telemetryRecords = telemetry.mock.calls.map(([, record]) => String(record)).join('');

    for (const secret of [...FORBIDDEN_IN_RESPONSE, EMAIL, bearer]) {
      expect(logged).not.toContain(secret);
      expect(telemetryRecords).not.toContain(secret);
    }
    for (const header of INTERNAL_HEADERS) {
      expect(logged.toLowerCase()).not.toContain(`${header}:`);
    }
  });

  it('las trazas OTel solo llevan método, plantilla de ruta, traceId y estado', async () => {
    await provider.forceFlush();
    const spans = tel.getFinishedSpans();

    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      const serialized = JSON.stringify({ name: span.name, attributes: span.attributes });
      for (const secret of [...FORBIDDEN_IN_RESPONSE, EMAIL, bearer]) {
        expect(serialized).not.toContain(secret);
      }
      expect(span.name).toMatch(/^(GET|POST|PATCH) \/(auth|users)\//);
      expect(Object.keys(span.attributes).sort()).toEqual(
        expect.arrayContaining(['http.method', 'http.route', 'trace.id']),
      );
    }
  });

  it('la proyección pública del token omite el refresh token y campos internos', () => {
    const projected = toPublicTokenResponse({
      accessToken: 'access-062',
      refreshToken: REFRESH_TOKEN,
      expiresIn: 3600,
      absoluteExpiresAt: '2026-11-10T00:00:00.000Z',
      principal: { userId: OWNER_ID, sessionId: 'session-062', role: 'GUEST' },
    });

    expect(JSON.stringify(projected)).not.toContain(REFRESH_TOKEN);
    expect(projected).toEqual({
      accessToken: 'access-062',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { userId: OWNER_ID, sessionId: 'session-062', role: 'GUEST' },
    });
  });

  it('GatewayLogger redacta contraseña, correo, tokens, hash, foto y cabeceras internas', () => {
    const logger = new GatewayLogger();
    const before = writes.lines().length;
    logger.log('auditoria', {
      password: PASSWORD,
      email: EMAIL,
      authorization: `Bearer ${bearer}`,
      refreshToken: REFRESH_TOKEN,
      serviceToken: SERVICE_TOKEN,
      passwordHash: PASSWORD_HASH,
      photo: PHOTO_BASE64,
      cookie: `stayhub_refresh=${REFRESH_TOKEN}`,
      'x-internal-token': SERVICE_TOKEN,
      status: 200,
    });

    const record = writes.lines().slice(before).join('');
    expect(record).toContain('[REDACTED]');
    for (const secret of [PASSWORD, EMAIL, bearer, REFRESH_TOKEN, SERVICE_TOKEN, PASSWORD_HASH, PHOTO_BASE64]) {
      expect(record).not.toContain(secret);
    }
  });
});
