import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';

/**
 * AUTH-081 — Integración REAL G1 ↔ Auth (RQ-02, FR-001–FR-013).
 *
 * Complementa la verificación provider AUTH-078: aquí se ejercita el flujo público a través del
 * API Gateway desplegado (`CROSS_SERVICE_GATEWAY_URL`), comprobando los cuatro mapeos públicos, la
 * cookie de refresh (`Secure`/`HttpOnly`/`SameSite=Strict` y path restringido), la introspección con
 * rol autoritativo y la conservación de 401/429. El 503 fail-closed lo cubre GW-058 desde el lado
 * Gateway (apuntando a un Auth inalcanzable); desde el provider no se puede forzar sin reiniciarlo.
 *
 * Requiere G1/G2 reales, por eso se SALTA (no falla) sin `CROSS_SERVICE_PROVIDERS=true` y
 * `CROSS_SERVICE_GATEWAY_URL`. No debe marcarse la tarea hasta que pase contra el Gateway real.
 */

const GATEWAY_URL = process.env['CROSS_SERVICE_GATEWAY_URL'];
const ENABLED =
  process.env['CROSS_SERVICE_PROVIDERS'] === 'true' &&
  typeof GATEWAY_URL === 'string' &&
  GATEWAY_URL.length > 0;
const describeReal = ENABLED ? describe : describe.skip;

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly setCookie: readonly string[];
  readonly json: Record<string, unknown>;
}

interface CallOptions {
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly cookie?: string;
}

function endpoint(path: string): URL {
  const base = (GATEWAY_URL as string).replace(/\/$/, '');
  const hasPrefix = /\/api\/v\d+(\/|$)/.test(base);
  return new URL(`${base}${hasPrefix ? '' : '/api/v1'}${path}`);
}

function call(method: string, path: string, options: CallOptions = {}): Promise<Reply> {
  const url = endpoint(path);
  const secure = url.protocol === 'https:';
  const payload = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));
  const headers: Record<string, string> = { accept: 'application/json', ...(options.headers ?? {}) };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(payload.length);
  }
  if (options.cookie !== undefined) headers['cookie'] = options.cookie;

  const requestOptions: RequestOptions = {
    hostname: url.hostname,
    port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
    path: `${url.pathname}${url.search}`,
    method,
    headers,
    ...(secure ? { servername: url.hostname, rejectUnauthorized: false } : {}),
  };

  return new Promise((resolve, reject) => {
    const send = secure ? httpsRequest : httpRequest;
    const req = send(requestOptions, (res) => {
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
          json,
        });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function refreshCookieFrom(setCookie: readonly string[]): string | undefined {
  return setCookie.find((cookie) => cookie.startsWith('stayhub_refresh='));
}

describeReal('Integración real Gateway ↔ Auth (AUTH-081)', () => {
  const PASSWORD = 'S3cret-passphrase!';

  function uniqueEmail(): string {
    return `auth081-${randomUUID()}@stayhub.test`;
  }

  it('registro → login → validate → refresh → logout con cookie y rol autoritativo', async (): Promise<void> => {
    const email = uniqueEmail();

    const registered = await call('POST', '/auth/register', {
      headers: { 'idempotency-key': randomUUID() },
      body: { name: 'Ada Lovelace', email, password: PASSWORD, role: 'GUEST' },
    });
    expect(registered.status).toBe(201);
    expect(registered.json).toMatchObject({ name: 'Ada Lovelace', email, role: 'GUEST' });

    const loggedIn = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
    expect(loggedIn.status).toBe(200);
    expect(typeof loggedIn.json['accessToken']).toBe('string');

    // El refresh viaja SOLO en la cookie con atributos seguros y path restringido.
    const cookie = refreshCookieFrom(loggedIn.setCookie);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth\/refresh/i);
    expect(JSON.stringify(loggedIn.json)).not.toContain('refreshToken');

    // El rol del /validate proviene de Auth (autoritativo) y coincide con el del login.
    const principal = loggedIn.json['principal'] as Record<string, unknown> | undefined;
    const accessToken = loggedIn.json['accessToken'] as string;
    const validated = await call('GET', '/auth/validate', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(validated.status).toBe(200);
    expect(validated.json['role']).toBe(principal?.['role']);

    // El refresh rota la cookie sin exponer el token en el cuerpo.
    const cookiePair = cookie?.split(';')[0] ?? '';
    const refreshed = await call('POST', '/auth/refresh', { cookie: cookiePair });
    expect(refreshed.status).toBe(200);
    const rotated = refreshCookieFrom(refreshed.setCookie);
    expect(rotated).toBeDefined();
    expect(rotated?.split(';')[0]).not.toBe(cookiePair);
    expect(JSON.stringify(refreshed.json)).not.toContain('refreshToken');

    // Logout limpia la cookie de refresh (204) sin revocar el access token ya emitido.
    const loggedOut = await call('POST', '/auth/logout');
    expect(loggedOut.status).toBe(204);
    const cleared = refreshCookieFrom(loggedOut.setCookie);
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  }, 60_000);

  it('401 real: /auth/validate con bearer inválido conserva Problem Details', async (): Promise<void> => {
    const reply = await call('GET', '/auth/validate', {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    expect(reply.status).toBe(401);
    expect(String(reply.headers['content-type'])).toContain('application/problem+json');
  }, 30_000);

  it('429 real: el rate limit de login conserva el estado en el borde', async (): Promise<void> => {
    const email = uniqueEmail();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const reply = await call('POST', '/auth/login', {
        body: { email, password: 'wrong-password' },
      });
      statuses.push(reply.status);
      if (reply.status === 429) break;
    }
    expect(statuses).toContain(429);
  }, 90_000);
});
