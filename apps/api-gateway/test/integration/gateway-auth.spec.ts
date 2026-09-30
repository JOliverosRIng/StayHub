import { request as httpsRequest } from 'node:https';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import { loadGatewayConfig, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

import { startGateway } from '../../src/main';

/**
 * GW-058 — Integración REAL Gateway ↔ Auth (RQ-02, FR-001–FR-013, constitución §V/§VII).
 *
 * Verifica, contra el auth-service REAL de G3, el flujo público end-to-end a través del Gateway:
 * registro → login → refresh → validate, la cookie de refresh (`Secure`/`HttpOnly`/`SameSite`), los
 * estados reales 401/429/503 y que el rol de la sesión proviene de Auth (autoritativo) y se respeta.
 * Reutiliza el contrato consumer de GW-056; aquí se comprueba el comportamiento real. Ante fallos
 * solo se corrige `apps/api-gateway`; NUNCA el auth-service.
 *
 * Requiere dependencias EXTERNAS operativas; por eso la suite se SALTA (no falla) si no se provee el
 * entorno real, y NO debe marcarse la tarea hasta que pase contra el servicio real. Para habilitarla:
 *   - `GATEWAY_AUTH_E2E_BASE_URL`  → URL base del auth-service real de G3 (p. ej. http://127.0.0.1:3001).
 *   - `GATEWAY_TEST_REDIS_URL`     → Redis de borde para el rate limit.
 *   - El resto del entorno real del Gateway (`loadGatewayConfig`), en particular
 *     `GATEWAY_JWT_PUBLIC_KEYS_JSON`, `GATEWAY_JWT_ISSUER/AUDIENCE` y las claves de service token,
 *     ALINEADO con las claves e issuer/audience reales de Auth; de lo contrario `validate`/`refresh`
 *     responderían 401 por incompatibilidad de firma, no por el flujo.
 */

const AUTH_E2E_BASE_URL = process.env['GATEWAY_AUTH_E2E_BASE_URL'];
const REDIS_URL = process.env['GATEWAY_TEST_REDIS_URL'];
const ENABLED = typeof AUTH_E2E_BASE_URL === 'string' && typeof REDIS_URL === 'string';
const describeReal = ENABLED ? describe : describe.skip;

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly setCookie: readonly string[];
  readonly json: Record<string, unknown>;
}

function call(
  config: GatewayConfig,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown; cookie?: string } = {},
): Promise<Reply> {
  const payload = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));
  const headers: Record<string, string> = { accept: 'application/json', ...(options.headers ?? {}) };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(payload.length);
  }
  if (options.cookie !== undefined) headers['cookie'] = options.cookie;

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: '127.0.0.1',
        port: config.port,
        path,
        method,
        servername: 'localhost',
        rejectUnauthorized: false,
        headers,
      },
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
          const setCookie = res.headers['set-cookie'] ?? [];
          resolve({ status: res.statusCode ?? 0, headers: res.headers, setCookie, json });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function refreshCookieFrom(setCookie: readonly string[]): string | undefined {
  return setCookie.find((cookie) => cookie.startsWith('stayhub_refresh='));
}

describeReal('Integración real Gateway ↔ Auth (GW-058)', () => {
  const prefix = '/api/v1';
  const originalEnv = process.env;
  let config: GatewayConfig;
  let app: INestApplication;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      GATEWAY_AUTH_BASE_URL: AUTH_E2E_BASE_URL,
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    config = loadGatewayConfig();
    app = await startGateway(config);
  }, 30000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
    process.env = originalEnv;
  });

  function uniqueEmail(): string {
    return `gw058-${randomUUID()}@stayhub.test`;
  }

  it('registro → login → validate → refresh end-to-end con cookie y rol autoritativo', async () => {
    const email = uniqueEmail();
    const password = 'S3cret-passphrase!';

    const registered = await call(config, 'POST', `${prefix}/auth/register`, {
      headers: { 'idempotency-key': randomUUID() },
      body: { name: 'Ada Lovelace', email, password, role: 'GUEST' },
    });
    expect(registered.status).toBe(201);

    const loggedIn = await call(config, 'POST', `${prefix}/auth/login`, { body: { email, password } });
    expect(loggedIn.status).toBe(200);
    expect(typeof loggedIn.json['accessToken']).toBe('string');

    // La cookie de refresh es Secure / HttpOnly / SameSite=Strict y se restringe a la ruta de refresh.
    const cookie = refreshCookieFrom(loggedIn.setCookie);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth\/refresh/i);
    // El refresh token nunca viaja en el cuerpo.
    expect(JSON.stringify(loggedIn.json)).not.toContain('refreshToken');

    // El rol proviene de Auth (autoritativo) y el Gateway lo respeta en /validate.
    const principal = loggedIn.json['principal'] as Record<string, unknown> | undefined;
    const accessToken = loggedIn.json['accessToken'] as string;
    const validated = await call(config, 'GET', `${prefix}/auth/validate`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(validated.status).toBe(200);
    expect(validated.json['role']).toBe(principal?.['role']);

    // El refresh rota la cookie (nuevo valor, mismos atributos) sin exponer el token en el cuerpo.
    const cookiePair = cookie?.split(';')[0] ?? '';
    const refreshed = await call(config, 'POST', `${prefix}/auth/refresh`, { cookie: cookiePair });
    expect(refreshed.status).toBe(200);
    const rotated = refreshCookieFrom(refreshed.setCookie);
    expect(rotated).toBeDefined();
    expect(rotated).toMatch(/HttpOnly/i);
    expect(rotated).toMatch(/Secure/i);
    expect(rotated).toMatch(/SameSite=Strict/i);
    expect(rotated?.split(';')[0]).not.toBe(cookiePair);
  }, 30000);

  it('401 real: /validate con bearer inválido', async () => {
    const reply = await call(config, 'GET', `${prefix}/auth/validate`, {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    expect(reply.status).toBe(401);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 30000);

  it('429 real: el rate limit de borde del login corta antes de saturar Auth', async () => {
    const email = uniqueEmail();
    const attempts: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const reply = await call(config, 'POST', `${prefix}/auth/login`, {
        body: { email, password: 'wrong-password' },
      });
      attempts.push(reply.status);
      if (reply.status === 429) break;
    }
    expect(attempts).toContain(429);
  }, 60000);

});

/**
 * El 503 real (fail-closed) se verifica con un Gateway apuntado a un Auth INALCANZABLE. Va en su
 * propia suite porque el puerto del Gateway es fijo (8080): esta arranca tras cerrarse la anterior,
 * sin solaparse. No se toca el auth-service real.
 */
describeReal('Integración real Gateway ↔ Auth: fail-closed 503 (GW-058)', () => {
  const prefix = '/api/v1';
  const originalEnv = process.env;
  let downConfig: GatewayConfig;
  let downApp: INestApplication;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      GATEWAY_AUTH_BASE_URL: 'http://127.0.0.1:1',
      GATEWAY_REDIS_URL: REDIS_URL,
    };
    downConfig = loadGatewayConfig();
    downApp = await startGateway(downConfig);
  }, 30000);

  afterAll(async () => {
    if (downApp !== undefined) await downApp.close();
    process.env = originalEnv;
  });

  it('login responde 503 (Problem Details) cuando Auth es inalcanzable', async () => {
    const reply = await call(downConfig, 'POST', `${prefix}/auth/login`, {
      body: { email: `gw058-${randomUUID()}@stayhub.test`, password: 'S3cret-passphrase!' },
    });
    expect(reply.status).toBe(503);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 30000);
});
