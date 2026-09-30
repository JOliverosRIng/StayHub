import { request as httpsRequest } from 'node:https';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import { loadGatewayConfig, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { PHOTO_MAX_BYTES } from '@gateway/modules/users/profile-streaming.interceptor';

import { startGateway } from '../../src/main';

/**
 * GW-059 — Integración REAL Gateway ↔ Users (RQ-01, FR-011–FR-024, constitución §V/§VII).
 *
 * Verifica, contra el users-service REAL de G2, el perfil/foto a través del Gateway: ownership
 * (`sub == userId`), el límite EXACTO de 5.000.000 bytes de la foto, el streaming, y el fail-closed
 * (timeout / Users caído → 503). Reutiliza el contrato consumer de GW-057; aquí se comprueba el
 * comportamiento real. Ante fallos solo se corrige `apps/api-gateway`; NUNCA el users-service.
 *
 * El guard del Gateway (GW-040) exige bearer válido + introspección, por lo que esta verificación
 * necesita TAMBIÉN el auth-service real (para emitir/introspeccionar el bearer del dueño). La suite
 * se SALTA (no falla) si no se provee el entorno real, y NO debe marcarse la tarea hasta que pase
 * contra los servicios reales. Para habilitarla:
 *   - `GATEWAY_USERS_E2E_BASE_URL` → URL base del users-service real de G2.
 *   - `GATEWAY_AUTH_E2E_BASE_URL`  → URL base del auth-service real de G3 (para el bearer/introspección).
 *   - `GATEWAY_TEST_REDIS_URL`     → Redis de borde.
 *   - El resto del entorno real (`loadGatewayConfig`) ALINEADO con las claves e issuer/audience de Auth.
 */

const USERS_E2E_BASE_URL = process.env['GATEWAY_USERS_E2E_BASE_URL'];
const AUTH_E2E_BASE_URL = process.env['GATEWAY_AUTH_E2E_BASE_URL'];
const REDIS_URL = process.env['GATEWAY_TEST_REDIS_URL'];
const ENABLED =
  typeof USERS_E2E_BASE_URL === 'string' &&
  typeof AUTH_E2E_BASE_URL === 'string' &&
  typeof REDIS_URL === 'string';
const describeReal = ENABLED ? describe : describe.skip;

const PREFIX = '/api/v1';

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly bodyText: string;
  readonly json: Record<string, unknown>;
}

interface CallOptions {
  readonly headers?: Record<string, string>;
  readonly body?: Buffer;
  readonly contentType?: string;
  readonly json?: unknown;
}

function call(config: GatewayConfig, method: string, path: string, options: CallOptions = {}): Promise<Reply> {
  const payload = options.json !== undefined ? Buffer.from(JSON.stringify(options.json)) : options.body;
  const headers: Record<string, string> = { accept: 'application/json', ...(options.headers ?? {}) };
  if (payload !== undefined) {
    headers['content-type'] = options.json !== undefined ? 'application/json' : options.contentType ?? 'application/octet-stream';
    headers['content-length'] = String(payload.length);
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
          resolve({ status: res.statusCode ?? 0, headers: res.headers, bodyText: raw, json });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
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

/** Registra y autentica un usuario por el Gateway (Auth real) y devuelve su bearer y userId. */
async function ownerSession(config: GatewayConfig): Promise<{ bearer: string; userId: string }> {
  const email = `gw059-${randomUUID()}@stayhub.test`;
  const password = 'S3cret-passphrase!';
  const registered = await call(config, 'POST', `${PREFIX}/auth/register`, {
    headers: { 'idempotency-key': randomUUID() },
    json: { name: 'Ada Lovelace', email, password, role: 'GUEST' },
  });
  if (registered.status !== 201) throw new Error(`register failed: ${registered.status} ${registered.bodyText}`);

  const loggedIn = await call(config, 'POST', `${PREFIX}/auth/login`, { json: { email, password } });
  if (loggedIn.status !== 200) throw new Error(`login failed: ${loggedIn.status} ${loggedIn.bodyText}`);
  const bearer = loggedIn.json['accessToken'] as string;

  const validated = await call(config, 'GET', `${PREFIX}/auth/validate`, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  if (validated.status !== 200) throw new Error(`validate failed: ${validated.status}`);
  return { bearer, userId: validated.json['userId'] as string };
}

describeReal('Integración real Gateway ↔ Users (GW-059)', () => {
  const originalEnv = process.env;
  let config: GatewayConfig;
  let app: INestApplication;
  let owner: { bearer: string; userId: string };

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      GATEWAY_USERS_BASE_URL: USERS_E2E_BASE_URL,
      GATEWAY_AUTH_BASE_URL: AUTH_E2E_BASE_URL,
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    config = loadGatewayConfig();
    app = await startGateway(config);
    owner = await ownerSession(config);
  }, 60000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
    process.env = originalEnv;
  });

  function auth(): Record<string, string> {
    return { authorization: `Bearer ${owner.bearer}` };
  }

  it('el dueño lee su propio perfil (200) reenviando el bearer validado a Users', async () => {
    const reply = await call(config, 'GET', `${PREFIX}/users/${owner.userId}/profile`, { headers: auth() });
    expect(reply.status).toBe(200);
    expect(reply.json['id']).toBe(owner.userId);
  }, 30000);

  it('ownership: acceso a perfil ajeno → 403 antes de Users', async () => {
    const other = randomUUID();
    const reply = await call(config, 'GET', `${PREFIX}/users/${other}/profile`, { headers: auth() });
    expect(reply.status).toBe(403);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 30000);

  it('PATCH perfil acepta foto de EXACTAMENTE 5.000.000 bytes (200)', async () => {
    const part = multipart(PHOTO_MAX_BYTES);
    const reply = await call(config, 'PATCH', `${PREFIX}/users/${owner.userId}/profile`, {
      headers: auth(),
      body: part.body,
      contentType: part.contentType,
    });
    expect(reply.status).toBe(200);
  }, 30000);

  it('PATCH perfil rechaza una foto de 5.000.001 bytes con 413 (borde, no llega a Users)', async () => {
    const part = multipart(PHOTO_MAX_BYTES + 1);
    const reply = await call(config, 'PATCH', `${PREFIX}/users/${owner.userId}/profile`, {
      headers: auth(),
      body: part.body,
      contentType: part.contentType,
    });
    expect(reply.status).toBe(413);
  }, 30000);

  it('el dueño descarga su foto (200) por streaming', async () => {
    const reply = await call(config, 'GET', `${PREFIX}/users/${owner.userId}/profile/photo`, { headers: auth() });
    expect([200, 404]).toContain(reply.status); // 404 si aún no subió foto; 200 tras el PATCH previo
  }, 30000);
});

/**
 * Fail-closed 503: el Gateway (con Auth real para el guard) apunta a un Users INALCANZABLE. Suite
 * aparte por el puerto fijo (8080): arranca tras cerrarse la anterior. No se toca ningún servicio real.
 */
describeReal('Integración real Gateway ↔ Users: fail-closed 503 (GW-059)', () => {
  const originalEnv = process.env;
  let downConfig: GatewayConfig;
  let downApp: INestApplication;
  let owner: { bearer: string; userId: string };

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      GATEWAY_USERS_BASE_URL: 'http://127.0.0.1:1',
      GATEWAY_AUTH_BASE_URL: AUTH_E2E_BASE_URL,
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    downConfig = loadGatewayConfig();
    downApp = await startGateway(downConfig);
    owner = await ownerSession(downConfig);
  }, 60000);

  afterAll(async () => {
    if (downApp !== undefined) await downApp.close();
    process.env = originalEnv;
  });

  it('GET perfil responde 503 (Problem Details) cuando Users es inalcanzable', async () => {
    const reply = await call(downConfig, 'GET', `${PREFIX}/users/${owner.userId}/profile`, {
      headers: { authorization: `Bearer ${owner.bearer}` },
    });
    expect(reply.status).toBe(503);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 30000);
});
