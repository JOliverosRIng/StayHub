import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { compose, detectEngine, run } from './compose-harness';

/**
 * Harness de Compose para AUTH-079: levanta Auth + Users reales con PostgreSQL/Redis desechables
 * usando `docker compose`. Usa `network_mode: host` para que el host de pruebas alcance los
 * puertos publicados incluso con Docker rootless, y puertos libres para evitar colisiones.
 *
 * No consulta `users_db`: la verificación se hace por los endpoints internos de Auth.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');

export interface AuthUsersComposeHarness {
  readonly authBaseUrl: string;
  readonly usersBaseUrl: string;
  pauseUsers(): Promise<void>;
  unpauseUsers(): Promise<void>;
  waitUsersReady(): Promise<void>;
  logs(): string;
  dispose(): Promise<void>;
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

async function waitHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'sin respuesta';
  for (;;) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) throw new Error(`No alcanzó readiness en ${url} (${last})`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function provisionAuthUsersCompose(): Promise<AuthUsersComposeHarness> {
  const engine = detectEngine();
  if (engine === null) throw new Error('AUTH-079 requiere docker o podman');
  const env = envFile();
  const directory = mkdtempSync(join(tmpdir(), 'stayhub-auth079-'));
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const project = `stayhub-auth079-${suffix}`;
  const composeFile = join(directory, 'compose.yml');

  // Docker rootless mapea el uid del contenedor; se copian las claves públicas con modo legible.
  const secretsDir = join(directory, 'secrets');
  mkdirSync(secretsDir, { recursive: true });
  for (const name of ['access-public.pem', 'service-public.pem']) {
    const dest = join(secretsDir, name);
    copyFileSync(join(REPO_ROOT, 'secrets', name), dest);
    chmodSync(dest, 0o644);
  }

  const authDbPort = await freePort();
  const usersDbPort = await freePort();
  const redisPort = await freePort();
  const authPort = 3001;
  const usersPort = 3002;
  const authDbPassword = randomBytes(24).toString('base64url');
  const usersDbPassword = randomBytes(24).toString('base64url');
  const redisPassword = randomBytes(24).toString('base64url');

  const {
    USERS_JWT_ISSUER,
    USERS_JWT_AUDIENCE,
    USERS_JWT_KID,
    USERS_SERVICE_JWT_ISSUER,
    USERS_SERVICE_JWT_AUDIENCE,
    USERS_SERVICE_JWT_KID,
    USERS_REGISTRATION_SCOPE,
    USERS_LOOKUP_SCOPE,
  } = env;

  const yaml = `name: ${project}
services:
  auth-db:
    image: postgres:16-alpine
    network_mode: host
    environment:
      POSTGRES_DB: auth_db
      POSTGRES_USER: stayhub_auth
      POSTGRES_PASSWORD: ${authDbPassword}
    command: ["postgres", "-c", "port=${authDbPort}"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${authDbPort} -U stayhub_auth -d auth_db"]
      interval: 3s
      timeout: 3s
      retries: 30
  users-db:
    image: postgres:16-alpine
    network_mode: host
    environment:
      POSTGRES_DB: users_db
      POSTGRES_USER: users
      POSTGRES_PASSWORD: ${usersDbPassword}
    command: ["postgres", "-c", "port=${usersDbPort}"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${usersDbPort} -U users -d users_db"]
      interval: 3s
      timeout: 3s
      retries: 30
  auth-redis:
    image: redis:7-alpine
    network_mode: host
    command: ["redis-server", "--port", "${redisPort}", "--requirepass", "${redisPassword}"]
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -p ${redisPort} -a ${redisPassword} ping | grep PONG"]
      interval: 3s
      timeout: 3s
      retries: 30
  auth-migrate:
    build:
      context: ${REPO_ROOT}
      dockerfile: infra/docker/auth/Dockerfile
      target: build
    network_mode: host
    environment:
      AUTH_DATABASE_URL: postgresql://stayhub_auth:${authDbPassword}@127.0.0.1:${authDbPort}/auth_db?schema=public
    command: ["npm", "run", "prisma:migrate:deploy", "--workspace", "@stayhub/auth-service"]
    depends_on:
      auth-db: { condition: service_healthy }
    restart: "no"
  users-migrate:
    build:
      context: ${REPO_ROOT}
      dockerfile: infra/docker/users/Dockerfile
      target: migration
    network_mode: host
    environment:
      USERS_DATABASE_URL: postgresql://users:${usersDbPassword}@127.0.0.1:${usersDbPort}/users_db
      USERS_DATABASE_URL_FILE: ""
    depends_on:
      users-db: { condition: service_healthy }
    restart: "no"
  auth-service:
    build:
      context: ${REPO_ROOT}
      dockerfile: infra/docker/auth/Dockerfile
      target: runtime
    network_mode: host
    env_file:
      - ${join(REPO_ROOT, '.env')}
    environment:
      AUTH_PORT: "${authPort}"
      AUTH_DATABASE_URL: postgresql://stayhub_auth:${authDbPassword}@127.0.0.1:${authDbPort}/auth_db?schema=public
      AUTH_REDIS_URL: redis://:${redisPassword}@127.0.0.1:${redisPort}/0
      USERS_SERVICE_URL: http://127.0.0.1:${usersPort}
      AUTH_USERS_TIMEOUT_MS: "800"
      AUTH_USERS_CIRCUIT_FAILURE_THRESHOLD: "10"
      AUTH_RECONCILER_INTERVAL_SECONDS: "3600"
    depends_on:
      auth-db: { condition: service_healthy }
      auth-redis: { condition: service_healthy }
      auth-migrate: { condition: service_completed_successfully }
    restart: "no"
  users-service:
    build:
      context: ${REPO_ROOT}
      dockerfile: infra/docker/users/Dockerfile
      target: runtime
    network_mode: host
    environment:
      NODE_ENV: production
      USERS_PORT: "${usersPort}"
      USERS_DATABASE_URL: postgresql://users:${usersDbPassword}@127.0.0.1:${usersDbPort}/users_db
      USERS_DATABASE_URL_FILE: ""
      USERS_JWT_ISSUER: "${USERS_JWT_ISSUER}"
      USERS_JWT_AUDIENCE: "${USERS_JWT_AUDIENCE}"
      USERS_JWT_KID: "${USERS_JWT_KID}"
      USERS_JWT_PUBLIC_KEY_FILE: /secrets/access-public.pem
      USERS_SERVICE_JWT_ISSUER: "${USERS_SERVICE_JWT_ISSUER}"
      USERS_SERVICE_JWT_AUDIENCE: "${USERS_SERVICE_JWT_AUDIENCE}"
      USERS_SERVICE_JWT_KID: "${USERS_SERVICE_JWT_KID}"
      USERS_SERVICE_JWT_PUBLIC_KEY_FILE: /secrets/service-public.pem
      USERS_REGISTRATION_SCOPE: "${USERS_REGISTRATION_SCOPE}"
      USERS_LOOKUP_SCOPE: "${USERS_LOOKUP_SCOPE}"
      USERS_MAX_PHOTO_BYTES: "5000000"
      OTEL_EXPORTER_OTLP_ENDPOINT: http://127.0.0.1:4318
    volumes:
      - ${secretsDir}:/secrets:ro
    depends_on:
      users-db: { condition: service_healthy }
      users-migrate: { condition: service_completed_successfully }
    restart: "no"
`;
  writeFileSync(composeFile, yaml);

  const base = ['-f', composeFile, '-p', project];
  const up = compose(engine, [...base, 'up', '-d', '--build'], { cwd: REPO_ROOT, timeoutMs: 1_800_000 });
  if (up.status !== 0) {
    compose(engine, [...base, 'down', '-v', '--remove-orphans'], { cwd: REPO_ROOT, timeoutMs: 180_000 });
    removeComposeImages(project);
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`compose up falló:\n${up.stderr.slice(-4_000)}\n${up.stdout.slice(-2_000)}`);
  }

  const authBaseUrl = `http://127.0.0.1:${authPort}`;
  const usersBaseUrl = `http://127.0.0.1:${usersPort}`;
  const logs = (): string => compose(engine, [...base, 'logs', '--no-color', '--tail', '120'], { cwd: REPO_ROOT, timeoutMs: 60_000 }).stdout;

  try {
    await Promise.all([
      waitHttp(`${authBaseUrl}/health/ready`, 300_000),
      waitHttp(`${usersBaseUrl}/health/ready`, 300_000),
    ]);
  } catch (error) {
    throw new Error(`${(error as Error).message}\n${logs().slice(-4_000)}`);
  }

  return {
    authBaseUrl,
    usersBaseUrl,
    pauseUsers: (): Promise<void> => {
      const r = compose(engine, [...base, 'pause', 'users-service'], { cwd: REPO_ROOT, timeoutMs: 60_000 });
      if (r.status !== 0) throw new Error(`pause falló: ${r.stderr}`);
      return Promise.resolve();
    },
    unpauseUsers: (): Promise<void> => {
      const r = compose(engine, [...base, 'unpause', 'users-service'], { cwd: REPO_ROOT, timeoutMs: 60_000 });
      if (r.status !== 0) throw new Error(`unpause falló: ${r.stderr}`);
      return Promise.resolve();
    },
    waitUsersReady: async (): Promise<void> => {
      await waitHttp(`${usersBaseUrl}/health/ready`, 120_000);
    },
    logs,
    dispose: (): Promise<void> => {
      compose(engine, [...base, 'down', '-v', '--remove-orphans'], { cwd: REPO_ROOT, timeoutMs: 180_000 });
      removeComposeImages(project);
      rmSync(directory, { recursive: true, force: true });
      return Promise.resolve();
    },
  };
}

export function removeComposeImages(project: string): void {
  const engine = detectEngine();
  if (engine === null) return;
  for (const service of ['auth-service', 'auth-migrate', 'users-service', 'users-migrate']) {
    run(engine, ['rmi', `${project}-${service}`, `${project}_${service}`], { timeoutMs: 120_000 });
  }
}
