import { createPublicKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadAuthConfig } from '@auth/infrastructure/config/auth-config';
import { loadUsersConfig } from '../../../users-service/src/infrastructure/config/users-config';

const repoRoot = resolve(__dirname, '../../../..');
const generator = join(repoRoot, 'scripts/generate-auth-dev-env.mjs');
const examplePath = join(repoRoot, '.env.example');
const SECRET_FILES = [
  'access-public.pem',
  'service-public.pem',
  'gateway-public.pem',
  'gateway-private.pem',
  'users-db-password.txt',
  'users-database-url.txt',
];

interface GenerationResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function generate(root: string): GenerationResult {
  const result = spawnSync(process.execPath, [generator, '--root', root, '--example', examplePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function parseEnv(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1] as string, match[2] as string);
  }
  return values;
}

function publicFrom(privateKey: string): string {
  return createPublicKey(privateKey.replace(/\\n/g, '\n'))
    .export({ type: 'spki', format: 'pem' })
    .toString()
    .trim();
}

describe('Configuración persistente compartida Auth<->Users (task-02)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'stayhub-dev-env-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('alinea .env.example según la tabla B1', () => {
    const env = parseEnv(readFileSync(examplePath, 'utf8'));

    expect(env.get('AUTH_JWT_ACTIVE_KID')).toBe('stayhub-auth-2026-01');
    expect(env.get('AUTH_JWT_ISSUER')).toBe('https://auth.stayhub.internal');
    expect(env.get('AUTH_JWT_AUDIENCE')).toBe('stayhub-api');
    expect(env.get('AUTH_OUTBOUND_SERVICE_KID')).toBe('auth-users-2026-01');
    expect(env.get('AUTH_OUTBOUND_SERVICE_ISSUER')).toBe('stayhub-auth-service');
    expect(env.get('AUTH_OUTBOUND_SERVICE_AUDIENCE')).toBe('stayhub-users-service');
    expect(env.get('AUTH_OUTBOUND_SERVICE_SCOPE')).toBe('users:registration users:login-identity');
    expect(env.get('USERS_REGISTRATION_SCOPE')).toBe('users:registration');
    expect(env.get('USERS_LOOKUP_SCOPE')).toBe('users:login-identity');
    expect(env.get('USERS_JWT_KID')).toBe(env.get('AUTH_JWT_ACTIVE_KID'));
    expect(env.get('USERS_JWT_ISSUER')).toBe(env.get('AUTH_JWT_ISSUER'));
    expect(env.get('USERS_JWT_AUDIENCE')).toBe(env.get('AUTH_JWT_AUDIENCE'));
    expect(env.get('USERS_SERVICE_JWT_KID')).toBe(env.get('AUTH_OUTBOUND_SERVICE_KID'));
    expect(env.get('USERS_SERVICE_JWT_ISSUER')).toBe(env.get('AUTH_OUTBOUND_SERVICE_ISSUER'));
    expect(env.get('USERS_SERVICE_JWT_AUDIENCE')).toBe(env.get('AUTH_OUTBOUND_SERVICE_AUDIENCE'));
  });

  it('genera .env y secretos coherentes con permisos restrictivos', () => {
    const result = generate(root);
    expect(result.status).toBe(0);

    const env = parseEnv(readFileSync(join(root, '.env'), 'utf8'));
    expect(env.get('AUTH_OUTBOUND_SERVICE_SCOPE')).toBe('users:registration users:login-identity');
    expect(env.get('USERS_JWT_PUBLIC_KEY_FILE')).toBe('./secrets/access-public.pem');
    expect(env.get('USERS_SERVICE_JWT_PUBLIC_KEY_FILE')).toBe('./secrets/service-public.pem');

    const accessPublic = readFileSync(join(root, 'secrets/access-public.pem'), 'utf8').trim();
    const servicePublic = readFileSync(join(root, 'secrets/service-public.pem'), 'utf8').trim();
    expect(accessPublic).toBe(publicFrom(env.get('AUTH_JWT_PRIVATE_KEY') ?? ''));
    expect(servicePublic).toBe(publicFrom(env.get('AUTH_OUTBOUND_SERVICE_PRIVATE_KEY') ?? ''));

    expect(statSync(join(root, '.env')).mode & 0o777).toBe(0o600);
    for (const file of SECRET_FILES) {
      expect(statSync(join(root, 'secrets', file)).mode & 0o777).toBe(0o600);
    }

    const usersPrivate = [...env.entries()]
      .filter(([name]) => name.startsWith('USERS_'))
      .some(([, value]) => value.includes('PRIVATE KEY'));
    expect(usersPrivate).toBe(false);
  });

  it('carga la configuración generada en Auth y en Users', () => {
    expect(generate(root).status).toBe(0);
    const env = parseEnv(readFileSync(join(root, '.env'), 'utf8'));

    const auth = loadAuthConfig(Object.fromEntries(env));
    expect(auth.accessJwt.activeKid).toBe('stayhub-auth-2026-01');
    expect(auth.outboundServiceJwt.kid).toBe('auth-users-2026-01');
    expect(auth.outboundServiceJwt.scope).toBe('users:registration users:login-identity');

    const usersEnv: NodeJS.ProcessEnv = Object.fromEntries(env);
    for (const key of [
      'USERS_JWT_PUBLIC_KEY_FILE',
      'USERS_SERVICE_JWT_PUBLIC_KEY_FILE',
      'USERS_DATABASE_URL_FILE',
      'USERS_DB_PASSWORD_FILE',
    ]) {
      usersEnv[key] = join(root, usersEnv[key] as string);
    }
    const users = loadUsersConfig(usersEnv);
    expect(users.userJwt.kid).toBe('stayhub-auth-2026-01');
    expect(users.serviceJwt.kid).toBe('auth-users-2026-01');
    expect(users.registrationScope).toBe('users:registration');
    expect(users.lookupScope).toBe('users:login-identity');
    expect(users.userJwt.publicKey).not.toContain('PRIVATE KEY');
    expect(users.serviceJwt.publicKey).not.toContain('PRIVATE KEY');
  });

  it('reutiliza .env y secretos en la segunda ejecución sin rotarlos', () => {
    expect(generate(root).status).toBe(0);
    const readAll = (): string =>
      ['.env', ...SECRET_FILES.map((file) => join('secrets', file))]
        .map((file) => readFileSync(join(root, file), 'utf8'))
        .join('\n');

    const before = readAll();
    const second = generate(root);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('reutilizado');
    expect(readAll()).toBe(before);
  });

  it('no sobrescribe ante un conflicto de configuración', () => {
    expect(generate(root).status).toBe(0);
    const envPath = join(root, '.env');
    const conflicting = readFileSync(envPath, 'utf8').replace(
      /^AUTH_OUTBOUND_SERVICE_SCOPE=.*$/m,
      'AUTH_OUTBOUND_SERVICE_SCOPE=users:identity',
    );
    writeFileSync(envPath, conflicting);

    const result = generate(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('conflicto');
    expect(readFileSync(envPath, 'utf8')).toBe(conflicting);
  });
});
