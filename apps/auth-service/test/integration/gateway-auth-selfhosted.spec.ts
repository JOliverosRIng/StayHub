import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';

/**
 * AUTH-081 — Integración REAL G1 ↔ Auth con auto-hospedaje local.
 *
 * Levanta el entorno completo sin infraestructura externa: Auth + Users reales con el harness
 * (PostgreSQL/Redis desechables), un Redis de borde y el API Gateway real (`dist`), y ejecuta el
 * flujo público registro → login → validate → refresh → logout, la cookie de refresh, 401 y 429.
 *
 * Requiere `AUTH_GATEWAY_E2E_SELF_HOSTED=true`, el gateway compilado (`npm run build:gateway`),
 * el puerto 8080 libre y, en Docker rootless, `AUTH_USERS_TEST_HOST_NETWORK=true`.
 * Para entornos ya desplegados usa `test/integration/gateway-auth.spec.ts`.
 */

const ENABLED = process.env['AUTH_GATEWAY_E2E_SELF_HOSTED'] === 'true';
const describeSelf = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(__dirname, '../../../..');
const GATEWAY_PORT = 8080;
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const PREFIX = '/api/v1';

function envFile(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(REPO_ROOT, '.env'), 'utf8').split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const server = net.createServer();
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        rej(new Error('No se pudo reservar un puerto libre'));
        return;
      }
      const { port } = address;
      server.close(() => res(port));
    });
  });
}

async function waitForLiveness(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // reintenta hasta el deadline
    }
    if (Date.now() > deadline) throw new Error(`El Gateway no alcanzó liveness en ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly cookies: readonly string[];
}

describeSelf('Integración real Gateway ↔ Auth auto-hospedada (AUTH-081)', () => {
  let harness: AuthUsersHarness | undefined;
  let gateway: ChildProcess | null = null;
  let redisName = '';
  let available = false;

  beforeAll(async () => {
    const h = await provisionAuthUsersHarness();
    harness = h;
    const env = envFile();
    const redisPort = await freePort();
    const redisPass = randomBytes(24).toString('base64url');
    redisName = `stayhub-auth081-redis-${process.pid}`;
    {
      const passwordFile = join(tmpdir(), `${redisName}.pw`);
      writeFileSync(passwordFile, redisPass);
      const started = spawnSync(
        'docker',
        ['run', '-d', '--network', 'host', '--name', redisName, 'redis:7-alpine', 'redis-server', '--port', String(redisPort), '--requirepass', redisPass],
        { encoding: 'utf8' },
      );
      if (started.status !== 0) throw new Error(`No se pudo iniciar Redis: ${started.stderr}`);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const ping = spawnSync('docker', ['exec', redisName, 'redis-cli', '-p', String(redisPort), '-a', redisPass, 'ping'], { encoding: 'utf8' });
        if (ping.stdout.includes('PONG')) break;
        await new Promise((r) => setTimeout(r, 500));
      }

      const inbound = JSON.parse(env['AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON'] as string) as Record<string, string>;
      const kid = Object.keys(inbound)[0] as string;
      gateway = spawn(process.execPath, ['dist/apps/api-gateway/main.js'], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          GATEWAY_PORT: String(GATEWAY_PORT),
          GATEWAY_API_PREFIX: PREFIX,
          GATEWAY_PROTOCOL: 'http',
          GATEWAY_AUTH_BASE_URL: h.authBaseUrl,
          GATEWAY_USERS_BASE_URL: h.usersBaseUrl,
          GATEWAY_REVIEWS_BASE_URL: 'http://127.0.0.1:3007',
          GATEWAY_JWT_PUBLIC_KEYS_JSON: env['AUTH_JWT_PUBLIC_KEYS_JSON'] as string,
          GATEWAY_JWT_ISSUER: env['AUTH_JWT_ISSUER'] as string,
          GATEWAY_JWT_AUDIENCE: env['AUTH_JWT_AUDIENCE'] as string,
          GATEWAY_SERVICE_KID: kid,
          GATEWAY_SERVICE_PRIVATE_KEY_FILE: join(REPO_ROOT, 'secrets/gateway-private.pem'),
          GATEWAY_SERVICE_ISSUER: env['AUTH_INBOUND_SERVICE_ISSUER'] as string,
          GATEWAY_SERVICE_AUDIENCE: env['AUTH_INBOUND_SERVICE_AUDIENCE'] as string,
          GATEWAY_SERVICE_SCOPE: env['AUTH_INBOUND_SERVICE_SCOPE'] as string,
          GATEWAY_SERVICE_TTL_SECONDS: '60',
          GATEWAY_REVIEWS_SERVICE_AUDIENCE: 'stayhub-reviews-service',
          GATEWAY_REVIEWS_SERVICE_SCOPE: 'reviews:read',
          GATEWAY_REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
          GATEWAY_REDIS_PASSWORD_FILE: passwordFile,
          GATEWAY_REDIS_NAMESPACE: 'gateway:edge:test',
          GATEWAY_TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
          GATEWAY_REGISTER_RATE_LIMIT: '10',
          GATEWAY_REGISTER_RATE_WINDOW_SECONDS: '600',
          GATEWAY_LOGIN_RATE_LIMIT: '30',
          GATEWAY_LOGIN_RATE_WINDOW_SECONDS: '300',
          GATEWAY_MAX_PHOTO_BYTES: '5000000',
          GATEWAY_AUTH_TIMEOUT_MS: '5000',
          GATEWAY_AUTH_CIRCUIT_FAILURE_THRESHOLD: '5',
          GATEWAY_AUTH_CIRCUIT_RESET_MS: '30000',
          GATEWAY_USERS_TIMEOUT_MS: '5000',
          GATEWAY_USERS_CIRCUIT_FAILURE_THRESHOLD: '5',
          GATEWAY_USERS_CIRCUIT_RESET_MS: '30000',
          GATEWAY_REVIEWS_TIMEOUT_MS: '3000',
          GATEWAY_REVIEWS_CIRCUIT_FAILURE_THRESHOLD: '5',
          GATEWAY_REVIEWS_CIRCUIT_RESET_MS: '30000',
          GATEWAY_INTROSPECTION_TIMEOUT_MS: '5000',
          GATEWAY_OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
          GATEWAY_OTEL_SERVICE_NAME: 'stayhub-api-gateway-test',
          GATEWAY_SWAGGER_SERVER_URL: '',
        },
      });
      try {
        await waitForLiveness(`${GATEWAY_URL}/health/live`, 120_000);
        available = true;
      } catch {
        available = false;
      }
    }
  }, 900_000);

  afterAll(async () => {
    gateway?.kill('SIGKILL');
    if (redisName !== '') spawnSync('docker', ['rm', '-f', redisName], { encoding: 'utf8' });
    await harness?.dispose();
  }, 120_000);

  function requireGateway(): void {
    if (!available) throw new Error('El Gateway auto-hospedado no arrancó; revisa dist y el puerto 8080');
  }

  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    requireGateway();
    const response = await fetch(`${GATEWAY_URL}${PREFIX}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
      cookies: response.headers.getSetCookie(),
    };
  }

  function refreshCookie(cookies: readonly string[]): string | undefined {
    return cookies.find((cookie) => cookie.startsWith('stayhub_refresh='));
  }

  it('registro → login → validate → refresh → logout por el Gateway real', async () => {
    const email = `auth081-${randomUUID()}@stayhub.test`;
    const password = 'S3cret-passphrase!';

    const registered = await call('POST', '/auth/register', { name: 'Ada Lovelace', email, password, role: 'GUEST' }, { 'idempotency-key': randomUUID() });
    expect(registered.status).toBe(201);
    expect(registered.body).toMatchObject({ name: 'Ada Lovelace', email, role: 'GUEST' });

    const loggedIn = await call('POST', '/auth/login', { email, password });
    expect(loggedIn.status).toBe(200);
    expect(typeof loggedIn.body['accessToken']).toBe('string');
    const cookie = refreshCookie(loggedIn.cookies);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth\/refresh/i);
    expect(JSON.stringify(loggedIn.body)).not.toContain('refreshToken');

    const user = loggedIn.body['user'] as Record<string, unknown>;
    const validated = await call('GET', '/auth/validate', undefined, { authorization: `Bearer ${loggedIn.body['accessToken'] as string}` });
    expect(validated.status).toBe(200);
    expect(validated.body['role']).toBe(user['role']);

    const rotatedReply = await call('POST', '/auth/refresh', undefined, { cookie: cookie?.split(';')[0] ?? '' });
    expect(rotatedReply.status).toBe(200);
    const rotated = refreshCookie(rotatedReply.cookies);
    expect(rotated?.split(';')[0]).not.toBe(cookie?.split(';')[0]);

    const loggedOut = await call('POST', '/auth/logout');
    expect(loggedOut.status).toBe(204);
    expect(refreshCookie(loggedOut.cookies)).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  }, 120_000);

  it('401 real: /auth/validate con bearer inválido', async () => {
    const reply = await call('GET', '/auth/validate', undefined, { authorization: 'Bearer not-a-valid-token' });
    expect(reply.status).toBe(401);
  }, 30_000);

  it('429 real: el rate limit de login se conserva en el borde', async () => {
    const email = `auth081-${randomUUID()}@stayhub.test`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const reply = await call('POST', '/auth/login', { email, password: 'wrong-password' });
      statuses.push(reply.status);
      if (reply.status === 429) break;
    }
    expect(statuses).toContain(429);
  }, 90_000);
});
