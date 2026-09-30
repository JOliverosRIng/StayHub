import { request as httpsRequest } from 'node:https';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import { loadGatewayConfig, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { PHOTO_MAX_BYTES } from '@gateway/modules/users/profile-streaming.interceptor';

import { startGateway } from '../../src/main';

/**
 * GW-060 — E2E HTTPS del Sprint 1 (RQ-01, RQ-02, SC-002–SC-004, constitución §V).
 *
 * Ejecuta, por HTTPS y a través del Gateway, con Auth (G3) y Users (G2) REALES, el flujo feliz
 * registro → login → perfil → cambio de correo → refresh (el correo nuevo sirve para login y el
 * anterior no) y los negativos 400/401/403/413/429/503, comprobando que solo `/api/v1` se expone y
 * que la identidad no es falsificable. Reúne GW-058 (Auth) y GW-059 (Users). Ante fallos solo se
 * corrige `apps/api-gateway`; NUNCA Auth ni Users.
 *
 * Depende de servicios EXTERNOS: la suite se SALTA (no falla) si no se provee el entorno real, y NO
 * debe marcarse la tarea hasta que pase end-to-end contra los servicios reales. Para habilitarla:
 *   - `GATEWAY_AUTH_E2E_BASE_URL`  → auth-service real (G3).
 *   - `GATEWAY_USERS_E2E_BASE_URL` → users-service real (G2).
 *   - `GATEWAY_TEST_REDIS_URL`     → Redis de borde.
 *   - Resto del entorno real (`loadGatewayConfig`) alineado con claves/issuer/audience de Auth.
 */

const AUTH_E2E_BASE_URL = process.env['GATEWAY_AUTH_E2E_BASE_URL'];
const USERS_E2E_BASE_URL = process.env['GATEWAY_USERS_E2E_BASE_URL'];
const REDIS_URL = process.env['GATEWAY_TEST_REDIS_URL'];
const ENABLED =
  typeof AUTH_E2E_BASE_URL === 'string' &&
  typeof USERS_E2E_BASE_URL === 'string' &&
  typeof REDIS_URL === 'string';
const describeReal = ENABLED ? describe : describe.skip;

const PREFIX = '/api/v1';

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly setCookie: readonly string[];
  readonly bodyText: string;
  readonly json: Record<string, unknown>;
}

interface CallOptions {
  readonly headers?: Record<string, string>;
  readonly json?: unknown;
  readonly body?: Buffer;
  readonly contentType?: string;
  readonly cookie?: string;
}

function call(config: GatewayConfig, method: string, path: string, options: CallOptions = {}): Promise<Reply> {
  const payload = options.json !== undefined ? Buffer.from(JSON.stringify(options.json)) : options.body;
  const headers: Record<string, string> = { accept: 'application/json', ...(options.headers ?? {}) };
  if (payload !== undefined) {
    headers['content-type'] =
      options.json !== undefined ? 'application/json' : options.contentType ?? 'application/octet-stream';
    headers['content-length'] = String(payload.length);
  }
  if (options.cookie !== undefined) headers['cookie'] = options.cookie;

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
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            setCookie: res.headers['set-cookie'] ?? [],
            bodyText: raw,
            json,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function profileMultipart(fields: Record<string, unknown>, photoBytes?: number): { body: Buffer; contentType: string } {
  const boundary = 'gw060Boundary';
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="profile"\r\n' +
        'Content-Type: application/json\r\n\r\n' +
        `${JSON.stringify(fields)}\r\n`,
    ),
  ];
  if (photoBytes !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="photo"; filename="p.jpg"\r\n' +
          'Content-Type: image/jpeg\r\n\r\n',
      ),
      Buffer.alloc(photoBytes, 0x27),
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

const PASSWORD = 'S3cret-passphrase!';

async function register(config: GatewayConfig, email: string): Promise<Reply> {
  return call(config, 'POST', `${PREFIX}/auth/register`, {
    headers: { 'idempotency-key': randomUUID() },
    json: { name: 'Ada Lovelace', email, password: PASSWORD, role: 'GUEST' },
  });
}

async function login(config: GatewayConfig, email: string, password = PASSWORD): Promise<Reply> {
  return call(config, 'POST', `${PREFIX}/auth/login`, { json: { email, password } });
}

function cookiePair(setCookie: readonly string[]): string {
  const cookie = setCookie.find((entry) => entry.startsWith('stayhub_refresh='));
  return cookie?.split(';')[0] ?? '';
}

describeReal('E2E Sprint 1 por HTTPS (GW-060)', () => {
  const originalEnv = process.env;
  let config: GatewayConfig;
  let app: INestApplication;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      GATEWAY_AUTH_BASE_URL: AUTH_E2E_BASE_URL,
      GATEWAY_USERS_BASE_URL: USERS_E2E_BASE_URL,
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    config = loadGatewayConfig();
    app = await startGateway(config);
  }, 60000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
    process.env = originalEnv;
  });

  it('flujo feliz: registro → login → perfil → cambio de correo → refresh; el correo nuevo sirve y el anterior no', async () => {
    const emailA = `gw060-${randomUUID()}@stayhub.test`;
    const emailB = `gw060-${randomUUID()}@stayhub.test`;

    expect((await register(config, emailA)).status).toBe(201);

    const loggedIn = await login(config, emailA);
    expect(loggedIn.status).toBe(200);
    const bearer = loggedIn.json['accessToken'] as string;
    const cookie = cookiePair(loggedIn.setCookie);
    expect(cookie).not.toBe('');

    const validated = await call(config, 'GET', `${PREFIX}/auth/validate`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(validated.status).toBe(200);
    const userId = validated.json['userId'] as string;

    const profile = await call(config, 'GET', `${PREFIX}/users/${userId}/profile`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(profile.status).toBe(200);
    const version = profile.json['version'] as number;

    const patch = profileMultipart({ expectedVersion: version, email: emailB });
    const changed = await call(config, 'PATCH', `${PREFIX}/users/${userId}/profile`, {
      headers: { authorization: `Bearer ${bearer}` },
      body: patch.body,
      contentType: patch.contentType,
    });
    expect(changed.status).toBe(200);

    const refreshed = await call(config, 'POST', `${PREFIX}/auth/refresh`, { cookie });
    expect(refreshed.status).toBe(200);

    // El correo nuevo sirve para login; el anterior ya no.
    expect((await login(config, emailB)).status).toBe(200);
    expect((await login(config, emailA)).status).toBe(401);
  }, 90000);

  it('400: registro con cuerpo inválido', async () => {
    const reply = await call(config, 'POST', `${PREFIX}/auth/register`, {
      headers: { 'idempotency-key': randomUUID() },
      json: { name: 'x', email: 'not-an-email', password: '123', role: 'GUEST' },
    });
    expect(reply.status).toBe(400);
  }, 30000);

  it('401: /validate con bearer inválido', async () => {
    const reply = await call(config, 'GET', `${PREFIX}/auth/validate`, {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    expect(reply.status).toBe(401);
  }, 30000);

  it('403: acceso a perfil ajeno (ownership) antes de Users', async () => {
    const email = `gw060-${randomUUID()}@stayhub.test`;
    expect((await register(config, email)).status).toBe(201);
    const bearer = (await login(config, email)).json['accessToken'] as string;
    const other = randomUUID();
    const reply = await call(config, 'GET', `${PREFIX}/users/${other}/profile`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(reply.status).toBe(403);
  }, 60000);

  it('413: foto de 5.000.001 bytes supera el límite exacto', async () => {
    const email = `gw060-${randomUUID()}@stayhub.test`;
    expect((await register(config, email)).status).toBe(201);
    const bearer = (await login(config, email)).json['accessToken'] as string;
    const userId = (
      await call(config, 'GET', `${PREFIX}/auth/validate`, { headers: { authorization: `Bearer ${bearer}` } })
    ).json['userId'] as string;

    const part = profileMultipart({ expectedVersion: 1 }, PHOTO_MAX_BYTES + 1);
    const reply = await call(config, 'PATCH', `${PREFIX}/users/${userId}/profile`, {
      headers: { authorization: `Bearer ${bearer}` },
      body: part.body,
      contentType: part.contentType,
    });
    expect(reply.status).toBe(413);
  }, 60000);

  it('429: el rate limit de borde del login corta', async () => {
    const email = `gw060-${randomUUID()}@stayhub.test`;
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const reply = await login(config, email, 'wrong-password');
      statuses.push(reply.status);
      if (reply.status === 429) break;
    }
    expect(statuses).toContain(429);
  }, 90000);

  it('identidad no falsificable: cabeceras de identidad del cliente se ignoran', async () => {
    const email = `gw060-${randomUUID()}@stayhub.test`;
    expect((await register(config, email)).status).toBe(201);
    const bearer = (await login(config, email)).json['accessToken'] as string;

    const validated = await call(config, 'GET', `${PREFIX}/auth/validate`, {
      headers: {
        authorization: `Bearer ${bearer}`,
        'x-user-id': randomUUID(),
        'x-user-role': 'ADMIN',
        'x-sub': randomUUID(),
      },
    });
    expect(validated.status).toBe(200);
    expect(validated.json['role']).toBe('GUEST'); // el rol proviene del bearer/Auth, no de las cabeceras
  }, 60000);

  it('solo /api/v1: una ruta sin el prefijo no existe (404)', async () => {
    const reply = await call(config, 'GET', `/users/${randomUUID()}/profile`, {
      headers: { authorization: 'Bearer whatever' },
    });
    expect(reply.status).toBe(404);
  }, 30000);
});

/**
 * 503 sin respuesta parcial: el Gateway (Auth real para el guard) apunta a un Users INALCANZABLE.
 * Suite aparte por el puerto fijo (8080): arranca tras cerrarse la anterior. No se toca ningún real.
 */
describeReal('E2E Sprint 1: dependencia caída → 503 (GW-060)', () => {
  const originalEnv = process.env;
  let downConfig: GatewayConfig;
  let downApp: INestApplication;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      GATEWAY_AUTH_BASE_URL: AUTH_E2E_BASE_URL,
      GATEWAY_USERS_BASE_URL: 'http://127.0.0.1:1',
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    downConfig = loadGatewayConfig();
    downApp = await startGateway(downConfig);
  }, 60000);

  afterAll(async () => {
    if (downApp !== undefined) await downApp.close();
    process.env = originalEnv;
  });

  it('perfil responde 503 (Problem Details) cuando Users es inalcanzable', async () => {
    const email = `gw060-${randomUUID()}@stayhub.test`;
    expect((await register(downConfig, email)).status).toBe(201);
    const bearer = (await login(downConfig, email)).json['accessToken'] as string;
    const userId = (
      await call(downConfig, 'GET', `${PREFIX}/auth/validate`, { headers: { authorization: `Bearer ${bearer}` } })
    ).json['userId'] as string;

    const reply = await call(downConfig, 'GET', `${PREFIX}/users/${userId}/profile`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(reply.status).toBe(503);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 60000);
});
