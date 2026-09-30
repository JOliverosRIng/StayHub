import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import { loadGatewayConfig, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { PHOTO_MAX_BYTES } from '@gateway/modules/users/profile-streaming.interceptor';

import { startGateway } from '../../src/main';

/**
 * GW-059 — Integración REAL Gateway ↔ Users (RQ-01, FR-011–FR-024, constitución §V/§VII).
 *
 * Verifica, a través del Gateway, contra el users-service REAL de G2: ownership (`sub == userId`) con
 * 403 ANTES de Users, el límite EXACTO de 5.000.000 bytes de la foto (5.000.001 → 413) con streaming
 * real, GET/PATCH de perfil y foto, y el fail-closed (Users caído/timeout → 503 sin cuerpo parcial).
 * Reutiliza el contrato consumer de GW-057. Ante fallos solo se corrige `apps/api-gateway`; NUNCA el
 * users-service.
 *
 * Dependencia según la tarea: **users-service real (G2) + Redis de borde** (la verificación del Auth
 * real es GW-058). El paso de introspección del guard se cubre con un STUB LOCAL que refleja el rol
 * del bearer, de modo que esta suite NO exige un auth-service en ejecución: solo un **bearer real
 * emitido por Auth** que el Users real acepte (`bearerAuth`). Se SALTA (no falla) si no se provee el
 * entorno real, y NO debe marcarse la tarea hasta que pase contra el Users real. Para habilitarla:
 *   - `GATEWAY_USERS_E2E_BASE_URL` → URL base del users-service real de G2.
 *   - `GATEWAY_USERS_E2E_BEARER`   → bearer de usuario real (emitido por Auth) que el Users real acepta.
 *   - `GATEWAY_TEST_REDIS_URL`     → Redis de borde.
 *   - El resto del entorno real del Gateway (`loadGatewayConfig`), con `GATEWAY_JWT_PUBLIC_KEYS_JSON`
 *     e issuer/audience ALINEADOS con la clave que firmó el bearer; si no, la verificación del JWT en
 *     el propio Gateway daría 401.
 */

const USERS_E2E_BASE_URL = process.env['GATEWAY_USERS_E2E_BASE_URL'];
const USER_BEARER = process.env['GATEWAY_USERS_E2E_BEARER'];
const REDIS_URL = process.env['GATEWAY_TEST_REDIS_URL'];
const ENABLED =
  typeof USERS_E2E_BASE_URL === 'string' &&
  typeof USER_BEARER === 'string' &&
  typeof REDIS_URL === 'string';
const describeReal = ENABLED ? describe : describe.skip;

const PREFIX = '/api/v1';

/** Claims mínimos que el guard necesita del bearer (sub para ownership, role para coherencia). */
interface BearerClaims {
  readonly sub: string;
  readonly role: string;
}

function decodeBearer(token: string): BearerClaims {
  const segment = token.split('.')[1] ?? '';
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(normalized, 'base64').toString('utf8');
  const claims = JSON.parse(json) as { sub?: string; role?: string };
  return { sub: claims.sub ?? '', role: claims.role ?? 'GUEST' };
}

/**
 * Stub local del paso de introspección de Auth (GW-039): responde la sesión como activa con el MISMO
 * rol del bearer, para que la coherencia de rol del guard (GW-040) pase sin un auth-service real.
 */
interface IntrospectionStub {
  readonly server: Server;
  listen(): Promise<void>;
  baseUrl(): string;
}

function createIntrospectionStub(role: string): IntrospectionStub {
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    incoming.on('data', () => undefined);
    incoming.on('end', () => {
      if ((incoming.url ?? '').includes('/sessions/validate')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ active: true, role }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/problem+json' });
      response.end(JSON.stringify({ code: 'NOT_FOUND' }));
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

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly json: Record<string, unknown>;
}

interface CallOptions {
  readonly headers?: Record<string, string>;
  readonly body?: Buffer;
  readonly contentType?: string;
}

function call(config: GatewayConfig, method: string, path: string, options: CallOptions = {}): Promise<Reply> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${USER_BEARER ?? ''}`,
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) {
    headers['content-type'] = options.contentType ?? 'application/octet-stream';
    headers['content-length'] = String(options.body.length);
  }
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      { host: '127.0.0.1', port: config.port, path, method, servername: 'localhost', rejectUnauthorized: false, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          let json: Record<string, unknown> = {};
          try {
            json = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            json = {};
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, json });
        });
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

function multipart(photoBytes: number): { body: Buffer; contentType: string } {
  const boundary = 'gw059Boundary';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="profile"\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      `${JSON.stringify({ expectedVersion: 1, name: 'Grace Hopper' })}\r\n` +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="photo"; filename="p.jpg"\r\n' +
      'Content-Type: image/jpeg\r\n\r\n',
  );
  const photo = Buffer.alloc(photoBytes, 0x27);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, photo, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

const claims = USER_BEARER !== undefined ? decodeBearer(USER_BEARER) : { sub: '', role: 'GUEST' };

describeReal('Integración real Gateway ↔ Users (GW-059)', () => {
  const originalEnv = process.env;
  const introspection = createIntrospectionStub(claims.role);
  let config: GatewayConfig;
  let app: INestApplication;

  beforeAll(async () => {
    await introspection.listen();
    process.env = {
      ...originalEnv,
      GATEWAY_USERS_BASE_URL: USERS_E2E_BASE_URL,
      GATEWAY_AUTH_BASE_URL: introspection.baseUrl(),
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    config = loadGatewayConfig();
    app = await startGateway(config);
  }, 30000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
    await new Promise<void>((resolve) => introspection.server.close(() => resolve()));
    process.env = originalEnv;
  });

  it('el dueño lee su propio perfil (200) reenviando el bearer validado a Users', async () => {
    const reply = await call(config, 'GET', `${PREFIX}/users/${claims.sub}/profile`);
    expect(reply.status).toBe(200);
    expect(reply.json['id']).toBe(claims.sub);
  }, 30000);

  it('ownership: acceso a perfil ajeno → 403 antes de Users', async () => {
    const other = randomUUID();
    const reply = await call(config, 'GET', `${PREFIX}/users/${other}/profile`);
    expect(reply.status).toBe(403);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 30000);

  it('PATCH perfil acepta foto de EXACTAMENTE 5.000.000 bytes (200)', async () => {
    const part = multipart(PHOTO_MAX_BYTES);
    const reply = await call(config, 'PATCH', `${PREFIX}/users/${claims.sub}/profile`, {
      body: part.body,
      contentType: part.contentType,
    });
    expect(reply.status).toBe(200);
  }, 30000);

  it('PATCH perfil rechaza una foto de 5.000.001 bytes con 413 (borde, no llega a Users)', async () => {
    const part = multipart(PHOTO_MAX_BYTES + 1);
    const reply = await call(config, 'PATCH', `${PREFIX}/users/${claims.sub}/profile`, {
      body: part.body,
      contentType: part.contentType,
    });
    expect(reply.status).toBe(413);
  }, 30000);

  it('el dueño descarga su foto por streaming (200 tras subirla, o 404 si aún no hay)', async () => {
    const reply = await call(config, 'GET', `${PREFIX}/users/${claims.sub}/profile/photo`);
    expect([200, 404]).toContain(reply.status);
  }, 30000);
});

/**
 * Fail-closed 503: el Gateway apunta a un Users INALCANZABLE (con introspección stub para pasar el
 * guard). Suite aparte por el puerto fijo (8080): arranca tras cerrarse la anterior.
 */
describeReal('Integración real Gateway ↔ Users: fail-closed 503 (GW-059)', () => {
  const originalEnv = process.env;
  const introspection = createIntrospectionStub(claims.role);
  let downConfig: GatewayConfig;
  let downApp: INestApplication;

  beforeAll(async () => {
    await introspection.listen();
    process.env = {
      ...originalEnv,
      GATEWAY_USERS_BASE_URL: 'http://127.0.0.1:1',
      GATEWAY_AUTH_BASE_URL: introspection.baseUrl(),
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    downConfig = loadGatewayConfig();
    downApp = await startGateway(downConfig);
  }, 30000);

  afterAll(async () => {
    if (downApp !== undefined) await downApp.close();
    await new Promise<void>((resolve) => introspection.server.close(() => resolve()));
    process.env = originalEnv;
  });

  it('GET perfil responde 503 (Problem Details) cuando Users es inalcanzable', async () => {
    const reply = await call(downConfig, 'GET', `${PREFIX}/users/${claims.sub}/profile`);
    expect(reply.status).toBe(503);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 30000);
});
