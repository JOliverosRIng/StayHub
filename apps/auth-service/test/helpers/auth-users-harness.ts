import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';

import { importPKCS8, SignJWT } from 'jose';

import { detectEngine, run, type ContainerEngine } from './compose-harness';
import { startUsersFaultProxy, type UsersFaultProxy } from './users-fault-proxy';

// Harness de integración Auth<->Users sin Gateway (task-05).
//
// Arranca Auth y Users reales como procesos `node dist` separados (evita colisiones
// de aliases Prisma y estrategias Passport entre las dos aplicaciones) contra
// PostgreSQL 16 y Redis desechables en contenedores. Reutiliza la configuración
// persistente `.env`/`secrets/` (correspondencia B1) y sobrescribe únicamente los
// destinos de base de datos y Redis. No usa Gateway ni el stub de Users.

const REPO_ROOT = resolve(__dirname, '../../../..');
const AUTH_DIST_ENTRY = 'dist/apps/auth-service/main.js';
const USERS_DIST_ENTRY = 'dist/apps/users-service/main.js';
const USERS_PORT = 3002;
const DEFAULT_POSTGRES_IMAGE = 'postgres:16-alpine';
const DEFAULT_REDIS_IMAGE = 'redis:7-alpine';
const OTEL_ENDPOINT = 'http://127.0.0.1:4318';

const REQUIRED_ENV_KEYS = [
  'AUTH_JWT_ISSUER',
  'AUTH_JWT_AUDIENCE',
  'AUTH_JWT_ACTIVE_KID',
  'AUTH_INBOUND_SERVICE_ISSUER',
  'AUTH_INBOUND_SERVICE_AUDIENCE',
  'AUTH_INBOUND_SERVICE_SCOPE',
  'AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON',
  'USERS_JWT_ISSUER',
  'USERS_JWT_AUDIENCE',
  'USERS_JWT_KID',
  'USERS_SERVICE_JWT_ISSUER',
  'USERS_SERVICE_JWT_AUDIENCE',
  'USERS_SERVICE_JWT_KID',
  'USERS_REGISTRATION_SCOPE',
  'USERS_LOOKUP_SCOPE',
  'AUTH_OUTBOUND_SERVICE_PRIVATE_KEY',
] as const;

export interface DevEnvironment {
  readonly env: Record<string, string>;
  readonly secretsDir: string;
  readonly gatewayPrivateKey: string;
  readonly inboundKid: string;
}

export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly body: T | undefined;
  readonly text: string;
}

export interface RequestOptions {
  readonly method?: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly traceId?: string;
  // Cuerpo multipart/form-data (PATCH de perfil). Excluye `body`.
  readonly form?: FormData;
}

export interface UsersServiceTokenOptions {
  // Scopes separados por espacio. Por defecto, los de registro y lookup de `.env`.
  readonly scope?: string;
  // Clave privada PKCS8 alternativa (p. ej. una clave no confiada por Users).
  readonly privateKey?: string;
  readonly kid?: string;
}

export interface AuthUsersHarnessOptions {
  // Variables adicionales solo para el proceso Auth (p. ej. intervalo del reconciliador).
  readonly authEnv?: Readonly<Record<string, string>>;
  // Interpone el proxy de fallos entre Auth y Users real (USERS_SERVICE_URL -> proxy).
  readonly usersFaultProxy?: boolean;
}

export interface AuthUsersHarness {
  readonly authBaseUrl: string;
  readonly usersBaseUrl: string;
  serviceToken(): Promise<string>;
  // JWT de servicio Auth->Users firmado como Auth (AUTH_OUTBOUND_SERVICE_*). Solo
  // para preparar estados (PENDING/CANCELLED) o probar el guard de Users.
  usersServiceToken(options?: UsersServiceTokenOptions): Promise<string>;
  readonly registrationScope: string;
  readonly lookupScope: string;
  // Inspección de las bases desechables del harness (psql -At). Nunca la usa
  // el código productivo; solo las pruebas para comprobar invariantes.
  queryAuthDb(sql: string): string[];
  queryUsersDb(sql: string): string[];
  // Proxy de fallos (solo si se pidió `usersFaultProxy`).
  readonly faults: UsersFaultProxy | null;
  // Ciclo de vida de los procesos reales (INT-13/INT-17).
  stopUsers(): Promise<void>;
  startUsers(): Promise<void>;
  stopAuth(): Promise<void>;
  startAuth(): Promise<void>;
  // Reinicia los contenedores PostgreSQL y Redis del harness (los datos persisten
  // en sus volúmenes anónimos) y espera a que estén disponibles.
  restartInfrastructure(): Promise<void>;
  // Últimos logs de ambos procesos, para diagnosticar fallos.
  recentLogs(): string;
  authRequest<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  usersRequest<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  dispose(): Promise<void>;
}

interface CreatedResources {
  readonly containers: string[];
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, millis));
}

function loadEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match !== null && match[1] !== undefined && match[2] !== undefined) {
      values[match[1]] = match[2];
    }
  }
  return values;
}

// Reutiliza `.env` y `secrets/` sin regenerarlos. Si falta algo, falla con una
// instrucción explícita en lugar de aprovisionar claves distintas (rompería B1).
export function loadDevEnvironment(): DevEnvironment {
  const envPath = resolve(REPO_ROOT, '.env');
  if (!existsSync(envPath)) {
    throw new Error('Falta .env: ejecuta `npm run env:auth:dev` antes de test:auth-users');
  }
  const env = loadEnvFile(readFileSync(envPath, 'utf8'));
  const missing = REQUIRED_ENV_KEYS.filter((key) => (env[key] ?? '') === '');
  if (missing.length > 0) {
    throw new Error(
      `El .env no contiene la configuración de integración: ${missing.join(', ')}. ` +
        'Regénrala con `npm run env:auth:dev`.',
    );
  }
  const secretsDir = resolve(REPO_ROOT, 'secrets');
  const gatewayPrivatePath = resolve(secretsDir, 'gateway-private.pem');
  for (const required of ['gateway-private.pem', 'access-public.pem', 'service-public.pem']) {
    if (!existsSync(resolve(secretsDir, required))) {
      throw new Error(`Falta secrets/${required}: ejecuta \`npm run env:auth:dev\``);
    }
  }
  let inboundKeys: Record<string, unknown>;
  try {
    inboundKeys = JSON.parse(env.AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON ?? '{}') as Record<string, unknown>;
  } catch {
    throw new Error('AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON no es JSON válido en .env');
  }
  const inboundKid = Object.keys(inboundKeys)[0];
  if (inboundKid === undefined) {
    throw new Error('AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON no declara ninguna clave kid en .env');
  }
  return {
    env,
    secretsDir,
    gatewayPrivateKey: readFileSync(gatewayPrivatePath, 'utf8'),
    inboundKid,
  };
}

function allocateFreePort(): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('No se pudo reservar un puerto libre'));
        return;
      }
      const { port } = address;
      server.close(() => resolvePromise(port));
    });
  });
}

function assertPortFree(port: number): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const server = net.createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          `El puerto ${port} está ocupado (${error.code ?? 'error'}); libéralo o detén el stack de desarrollo`,
        ),
      );
    });
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePromise()));
  });
}

function startContainer(engine: ContainerEngine, args: readonly string[]): void {
  const result = run(engine, ['run', '-d', ...args], { timeoutMs: 120_000 });
  if (result.status !== 0) {
    throw new Error(`No se pudo iniciar el contenedor: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

async function waitForPostgres(
  engine: ContainerEngine,
  name: string,
  user: string,
  database: string,
): Promise<void> {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const result = run(engine, ['exec', name, 'pg_isready', '-U', user, '-d', database], {
      timeoutMs: 15_000,
    });
    if (result.status === 0) return;
    if (Date.now() > deadline) {
      throw new Error(`PostgreSQL ${name} no quedó disponible: ${result.stderr.trim() || result.stdout.trim()}`);
    }
    await sleep(500);
  }
}

async function waitForRedis(engine: ContainerEngine, name: string, password: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const result = run(engine, ['exec', name, 'redis-cli', '-a', password, 'ping'], {
      timeoutMs: 15_000,
    });
    if (result.stdout.includes('PONG')) return;
    if (Date.now() > deadline) {
      throw new Error(`Redis ${name} no quedó disponible: ${result.stderr.trim() || result.stdout.trim()}`);
    }
    await sleep(500);
  }
}

async function waitForReady(
  baseUrl: string,
  label: string,
  logs: readonly string[],
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'sin respuesta';
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(2_000) });
      last = `HTTP ${response.status}`;
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${label} no alcanzó readiness en ${baseUrl} (último: ${last}). Logs recientes:\n${logs.join('').slice(-4_000)}`,
      );
    }
    await sleep(500);
  }
}

function ensureBuilt(): void {
  const missing = [AUTH_DIST_ENTRY, USERS_DIST_ENTRY].filter(
    (entry) => !existsSync(resolve(REPO_ROOT, entry)),
  );
  if (missing.length === 0) return;
  for (const [label, script] of [
    ['Auth', 'build:auth'],
    ['Users', 'build:users'],
  ] as const) {
    const result = run('npm', ['run', script], { cwd: REPO_ROOT, timeoutMs: 600_000 });
    if (result.status !== 0) {
      throw new Error(`Falló la compilación de ${label}:\n${result.stdout}\n${result.stderr}`);
    }
  }
}

function migrateAuth(databaseUrl: string): void {
  const result = run(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema', 'apps/auth-service/prisma/schema.prisma'],
    { cwd: REPO_ROOT, env: { ...process.env, AUTH_DATABASE_URL: databaseUrl }, timeoutMs: 120_000 },
  );
  if (result.status !== 0) {
    throw new Error(`Migraciones de Auth fallidas:\n${result.stdout}\n${result.stderr}`);
  }
}

function migrateUsers(databaseUrl: string): void {
  const result = run(process.execPath, ['scripts/users-migrate.cjs'], {
    cwd: REPO_ROOT,
    env: { ...process.env, USERS_DATABASE_URL: databaseUrl, USERS_DATABASE_URL_FILE: '' },
    timeoutMs: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`Migraciones de Users fallidas:\n${result.stdout}\n${result.stderr}`);
  }
}

function spawnService(
  entry: string,
  env: NodeJS.ProcessEnv,
  label: string,
  logs: string[],
): ChildProcess {
  const child = spawn(process.execPath, [entry], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => logs.push(`[${label}] ${chunk.toString()}`));
  child.stderr?.on('data', (chunk: Buffer) => logs.push(`[${label}] ${chunk.toString()}`));
  return child;
}

async function terminate(child: ChildProcess | null): Promise<void> {
  if (child === null || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (child.exitCode === null && Date.now() < deadline) {
    await sleep(100);
  }
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function issueInboundToken(dev: DevEnvironment): Promise<string> {
  const key = await importPKCS8(dev.gatewayPrivateKey, 'RS256');
  const issuedAt = Math.floor(Date.now() / 1_000);
  return new SignJWT({ scope: dev.env.AUTH_INBOUND_SERVICE_SCOPE ?? '' })
    .setProtectedHeader({ alg: 'RS256', kid: dev.inboundKid, typ: 'JWT' })
    .setSubject('local-test-gateway')
    .setIssuer(dev.env.AUTH_INBOUND_SERVICE_ISSUER ?? '')
    .setAudience(dev.env.AUTH_INBOUND_SERVICE_AUDIENCE ?? '')
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3_600)
    .sign(key);
}

async function issueUsersServiceToken(
  dev: DevEnvironment,
  options: UsersServiceTokenOptions,
): Promise<string> {
  const pem = options.privateKey ?? (dev.env.AUTH_OUTBOUND_SERVICE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const key = await importPKCS8(pem, 'RS256');
  const scope =
    options.scope ?? `${dev.env.USERS_REGISTRATION_SCOPE ?? ''} ${dev.env.USERS_LOOKUP_SCOPE ?? ''}`.trim();
  const issuedAt = Math.floor(Date.now() / 1_000);
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? dev.env.USERS_SERVICE_JWT_KID ?? '', typ: 'JWT' })
    .setSubject('auth-users-test')
    .setIssuer(dev.env.USERS_SERVICE_JWT_ISSUER ?? '')
    .setAudience(dev.env.USERS_SERVICE_JWT_AUDIENCE ?? '')
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 60)
    .sign(key);
}

function queryDatabase(engine: ContainerEngine, container: string, user: string, database: string, sql: string): string[] {
  const result = run(engine, ['exec', container, 'psql', '-U', user, '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    timeoutMs: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`Consulta de inspección fallida en ${database}: ${result.stderr.trim()}`);
  }
  return result.stdout.split('\n').filter((line) => line !== '');
}

function buildAuthEnv(
  dev: DevEnvironment,
  authPort: number,
  databaseUrl: string,
  redisUrl: string,
  usersUrl: string,
  extra: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...dev.env,
    NODE_ENV: 'test',
    AUTH_PORT: String(authPort),
    AUTH_DATABASE_URL: databaseUrl,
    AUTH_REDIS_URL: redisUrl,
    USERS_SERVICE_URL: usersUrl,
    AUTH_SWAGGER_SERVER_URL: '',
    AUTH_TEST_ALLOW_CLEANUP: 'true',
    OTEL_EXPORTER_OTLP_ENDPOINT: OTEL_ENDPOINT,
    ...extra,
  };
}

function buildUsersEnv(dev: DevEnvironment, databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...dev.env,
    NODE_ENV: 'test',
    USERS_PORT: String(USERS_PORT),
    USERS_DATABASE_URL: databaseUrl,
    USERS_DATABASE_URL_FILE: '',
    USERS_MAX_PHOTO_BYTES: '5000000',
    OTEL_EXPORTER_OTLP_ENDPOINT: OTEL_ENDPOINT,
  };
}

async function performRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions,
): Promise<HttpResponse<T>> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
  if (options.traceId !== undefined) headers['x-trace-id'] = options.traceId;
  let body: string | FormData | undefined;
  if (options.form !== undefined) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    ...(body === undefined ? {} : { body }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed: T | undefined;
  try {
    parsed = text === '' ? undefined : (JSON.parse(text) as T);
  } catch {
    parsed = undefined;
  }
  return { status: response.status, body: parsed, text };
}

// Aprovisiona el entorno completo. Registra los contenedores creados para limpiar
// exclusivamente esos recursos, también si el arranque falla a mitad de camino.
export async function provisionAuthUsersHarness(
  options: AuthUsersHarnessOptions = {},
): Promise<AuthUsersHarness> {
  const engine = detectEngine();
  if (engine === null) {
    throw new Error('No hay docker ni podman disponibles: test:auth-users requiere un engine de contenedores');
  }
  const dev = loadDevEnvironment();
  const created: CreatedResources = { containers: [] };
  const logs: string[] = [];
  let authChild: ChildProcess | null = null;
  let usersChild: ChildProcess | null = null;
  let faults: UsersFaultProxy | null = null;

  const cleanup = async (): Promise<void> => {
    await Promise.all([terminate(authChild), terminate(usersChild)]);
    await faults?.close();
    for (const name of created.containers) {
      run(engine, ['rm', '-f', '-v', name], { timeoutMs: 60_000 });
    }
  };

  try {
    ensureBuilt();

    const postgresImage = process.env.AUTH_USERS_TEST_POSTGRES_IMAGE ?? DEFAULT_POSTGRES_IMAGE;
    const redisImage = process.env.AUTH_USERS_TEST_REDIS_IMAGE ?? DEFAULT_REDIS_IMAGE;
    const authDbPassword = randomBytes(24).toString('base64url');
    const usersDbPassword = randomBytes(24).toString('base64url');
    const redisPassword = randomBytes(24).toString('base64url');
    const [authDbPort, usersDbPort, redisPort, authHttpPort, proxyPort] = await Promise.all([
      allocateFreePort(),
      allocateFreePort(),
      allocateFreePort(),
      allocateFreePort(),
      allocateFreePort(),
    ]);
    await assertPortFree(USERS_PORT);

    const suffix = `${process.pid}-${Date.now().toString(36)}`;
    const authDbName = `stayhub-auth-users-test-${suffix}-auth-db`;
    const usersDbName = `stayhub-auth-users-test-${suffix}-users-db`;
    const redisName = `stayhub-auth-users-test-${suffix}-redis`;

    startContainer(engine, [
      '--name',
      authDbName,
      '-e',
      'POSTGRES_DB=auth_test',
      '-e',
      'POSTGRES_USER=stayhub_auth',
      '-e',
      `POSTGRES_PASSWORD=${authDbPassword}`,
      '-p',
      `127.0.0.1:${authDbPort}:5432`,
      postgresImage,
    ]);
    created.containers.push(authDbName);

    startContainer(engine, [
      '--name',
      usersDbName,
      '-e',
      'POSTGRES_DB=users_db',
      '-e',
      'POSTGRES_USER=users',
      '-e',
      `POSTGRES_PASSWORD=${usersDbPassword}`,
      '-p',
      `127.0.0.1:${usersDbPort}:5432`,
      postgresImage,
    ]);
    created.containers.push(usersDbName);

    startContainer(engine, [
      '--name',
      redisName,
      '-p',
      `127.0.0.1:${redisPort}:6379`,
      redisImage,
      'redis-server',
      '--requirepass',
      redisPassword,
    ]);
    created.containers.push(redisName);

    await Promise.all([
      waitForPostgres(engine, authDbName, 'stayhub_auth', 'auth_test'),
      waitForPostgres(engine, usersDbName, 'users', 'users_db'),
      waitForRedis(engine, redisName, redisPassword),
    ]);

    const authDatabaseUrl = `postgresql://stayhub_auth:${authDbPassword}@127.0.0.1:${authDbPort}/auth_test?schema=public`;
    const usersDatabaseUrl = `postgresql://users:${usersDbPassword}@127.0.0.1:${usersDbPort}/users_db`;
    const redisUrl = `redis://:${redisPassword}@127.0.0.1:${redisPort}/15`;

    migrateAuth(authDatabaseUrl);
    migrateUsers(usersDatabaseUrl);

    const authBaseUrl = `http://127.0.0.1:${authHttpPort}`;
    const usersBaseUrl = `http://127.0.0.1:${USERS_PORT}`;
    if (options.usersFaultProxy === true) faults = await startUsersFaultProxy(proxyPort, USERS_PORT);
    const authEnv = buildAuthEnv(
      dev,
      authHttpPort,
      authDatabaseUrl,
      redisUrl,
      faults?.url ?? usersBaseUrl,
      options.authEnv ?? {},
    );
    const usersEnv = buildUsersEnv(dev, usersDatabaseUrl);

    const startUsers = async (): Promise<void> => {
      if (usersChild !== null && usersChild.exitCode === null) return;
      usersChild = spawnService(USERS_DIST_ENTRY, usersEnv, 'users', logs);
      await waitForReady(usersBaseUrl, 'users-service', logs);
    };
    const startAuth = async (): Promise<void> => {
      if (authChild !== null && authChild.exitCode === null) return;
      authChild = spawnService(AUTH_DIST_ENTRY, authEnv, 'auth', logs);
      await waitForReady(authBaseUrl, 'auth-service', logs);
    };
    const stopUsers = async (): Promise<void> => {
      await terminate(usersChild);
      usersChild = null;
    };
    const stopAuth = async (): Promise<void> => {
      await terminate(authChild);
      authChild = null;
    };
    const restartInfrastructure = async (): Promise<void> => {
      for (const name of [authDbName, usersDbName, redisName]) {
        const result = run(engine, ['restart', name], { timeoutMs: 120_000 });
        if (result.status !== 0) throw new Error(`No se pudo reiniciar ${name}: ${result.stderr.trim()}`);
      }
      await Promise.all([
        waitForPostgres(engine, authDbName, 'stayhub_auth', 'auth_test'),
        waitForPostgres(engine, usersDbName, 'users', 'users_db'),
        waitForRedis(engine, redisName, redisPassword),
      ]);
    };

    await startUsers();
    await startAuth();

    return {
      authBaseUrl,
      usersBaseUrl,
      serviceToken: (): Promise<string> => issueInboundToken(dev),
      usersServiceToken: (options: UsersServiceTokenOptions = {}): Promise<string> =>
        issueUsersServiceToken(dev, options),
      registrationScope: dev.env.USERS_REGISTRATION_SCOPE ?? '',
      lookupScope: dev.env.USERS_LOOKUP_SCOPE ?? '',
      queryAuthDb: (sql: string): string[] => queryDatabase(engine, authDbName, 'stayhub_auth', 'auth_test', sql),
      queryUsersDb: (sql: string): string[] => queryDatabase(engine, usersDbName, 'users', 'users_db', sql),
      authRequest: <T>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> =>
        performRequest<T>(authBaseUrl, path, options),
      usersRequest: <T>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> =>
        performRequest<T>(usersBaseUrl, path, options),
      faults,
      stopUsers,
      startUsers,
      stopAuth,
      startAuth,
      restartInfrastructure,
      recentLogs: (): string => logs.join('').slice(-8_000),
      dispose: cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
