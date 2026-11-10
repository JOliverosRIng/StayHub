import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { importPKCS8, SignJWT } from 'jose';

import { provisionAuthUsersCompose, type AuthUsersComposeHarness } from '../helpers/auth-users-compose-harness';

/**
 * AUTH-079 — Registro completo y recuperación tras timeout en Compose.
 *
 * Levanta Auth + Users reales con `docker compose` (PostgreSQL/Redis desechables) y verifica el
 * registro completo y la recuperación cuando Users deja de responder. No consulta `users_db`: la
 * activación se comprueba con el login interno de Auth.
 *
 * Requiere `AUTH_079_COMPOSE=true`, Docker/Podman y las imágenes construibles. En Docker rootless el
 * harness usa `network_mode: host` con puertos libres.
 */

const ENABLED = process.env['AUTH_079_COMPOSE'] === 'true';
const describeCompose = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(__dirname, '../../../..');
const PASSWORD = 'S3cret-passphrase!';

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

async function serviceToken(): Promise<string> {
  const env = envFile();
  const keys = JSON.parse(env['AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON'] as string) as Record<string, string>;
  const kid = Object.keys(keys)[0] as string;
  const pem = readFileSync(join(REPO_ROOT, 'secrets/gateway-private.pem'), 'utf8');
  const key = await importPKCS8(pem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: env['AUTH_INBOUND_SERVICE_SCOPE'] })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setSubject('auth-079-compose')
    .setIssuer(env['AUTH_INBOUND_SERVICE_ISSUER'] as string)
    .setAudience(env['AUTH_INBOUND_SERVICE_AUDIENCE'] as string)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(key);
}

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

describeCompose('Auth↔Users en Compose (AUTH-079)', () => {
  let harness: AuthUsersComposeHarness | undefined;
  let token = '';

  beforeAll(async () => {
    harness = await provisionAuthUsersCompose();
    token = await serviceToken();
  }, 30 * 60_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 180_000);

  function h(): AuthUsersComposeHarness {
    if (harness === undefined) throw new Error('harness no inicializado');
    return harness;
  }

  async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const response = await fetch(`${h().authBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
  }

  function registration(email: string): Record<string, unknown> {
    return { name: 'Ada Lovelace', email, password: PASSWORD, role: 'GUEST' };
  }

  function register(email: string, key: string): Promise<Reply> {
    return post('/internal/v1/registrations', registration(email), { 'idempotency-key': key });
  }

  function login(email: string): Promise<Reply> {
    return post('/internal/v1/login', { email, password: PASSWORD });
  }

  it('registro completo por Auth con Users real en Compose', async () => {
    const email = `auth079-full-${randomUUID()}@stayhub.test`;
    const registered = await register(email, randomUUID());
    expect(registered.status).toBe(201);
    expect(registered.body).toMatchObject({ name: 'Ada Lovelace', email, role: 'GUEST' });

    const session = await login(email);
    expect(session.status).toBe(200);
    expect(typeof session.body['accessToken']).toBe('string');
  }, 180_000);

  it('recuperación tras timeout: Users deja de responder → 503 y el reintento converge', async () => {
    const email = `auth079-timeout-${randomUUID()}@stayhub.test`;
    const key = randomUUID();

    await h().pauseUsers();
    const timedOut = await register(email, key);
    expect(timedOut.status).toBe(503);
    expect(timedOut.body).toMatchObject({ status: 503, code: 'DEPENDENCY_UNAVAILABLE' });

    await h().unpauseUsers();
    await h().waitUsersReady();

    const retry = await register(email, key);
    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ email, role: 'GUEST' });

    const session = await login(email);
    expect(session.status).toBe(200);
    expect(typeof session.body['accessToken']).toBe('string');
  }, 180_000);
});
