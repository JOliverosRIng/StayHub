import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type ContainerEngine = 'docker' | 'podman';

export interface TestContainerEnvironment {
  readonly directory: string;
  readonly envFile: string;
  readonly project: string;
  readonly runtimeImage: string;
  readonly dbPassword: string;
  readonly redisPassword: string;
}

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export function detectEngine(): ContainerEngine | null {
  for (const candidate of ['docker', 'podman'] as const) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  return null;
}

export function run(program: string, args: readonly string[], options: RunOptions = {}): CommandResult {
  const result = spawnSync(program, [...args], {
    encoding: 'utf8',
    cwd: options.cwd,
    env: options.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeoutMs ?? 600_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function compose(engine: ContainerEngine, args: readonly string[], options: RunOptions = {}): CommandResult {
  return engine === 'podman'
    ? run('podman-compose', args, options)
    : run('docker', ['compose', ...args], options);
}

function escapePem(pem: string): string {
  return pem.replace(/\n/g, '\\n');
}

function randomSecret(): string {
  return randomBytes(48).toString('base64url');
}

export function createTestEnvironment(): TestContainerEnvironment {
  const directory = mkdtempSync(join(tmpdir(), 'auth-compose-082-'));
  const access = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const inbound = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const outbound = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const dbPassword = 'auth082_db_pw';
  const redisPassword = 'auth082_redis_pw';
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const envFile = join(directory, '.env');
  const runtimeImage = `stayhub-auth-082-runtime:${suffix}`;

  const lines = [
    'NODE_ENV=production',
    'AUTH_PORT=3001',
    `AUTH_DATABASE_URL=postgresql://stayhub_auth:${dbPassword}@auth-db:5432/auth_db?schema=public`,
    `AUTH_REDIS_URL=redis://:${redisPassword}@auth-redis:6379/0`,
    'AUTH_ARGON2_MEMORY_COST=8192',
    'AUTH_ARGON2_TIME_COST=2',
    'AUTH_ARGON2_PARALLELISM=1',
    'AUTH_JWT_ACTIVE_KID=kid-access-082',
    `AUTH_JWT_PRIVATE_KEY="${escapePem(access.privateKey)}"`,
    `AUTH_JWT_PUBLIC_KEYS_JSON={"kid-access-082":"${escapePem(access.publicKey)}"}`,
    'AUTH_JWT_ISSUER=https://auth.stayhub.test',
    'AUTH_JWT_AUDIENCE=stayhub-api',
    `AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON={"kid-inbound-082":"${escapePem(inbound.publicKey)}"}`,
    'AUTH_INBOUND_SERVICE_ISSUER=stayhub-test-gateway',
    'AUTH_INBOUND_SERVICE_AUDIENCE=stayhub-auth-service-test',
    'AUTH_INBOUND_SERVICE_SCOPE=auth:invoke',
    `AUTH_OUTBOUND_SERVICE_PRIVATE_KEY="${escapePem(outbound.privateKey)}"`,
    'AUTH_OUTBOUND_SERVICE_KID=kid-outbound-082',
    'AUTH_OUTBOUND_SERVICE_ISSUER=stayhub-auth-service-test',
    'AUTH_OUTBOUND_SERVICE_AUDIENCE=stayhub-users-service-test',
    'AUTH_OUTBOUND_SERVICE_SCOPE=users:identity',
    'AUTH_OUTBOUND_SERVICE_TTL_SECONDS=60',
    'USERS_SERVICE_URL=http://users-service:3001',
    'AUTH_USERS_TIMEOUT_MS=1000',
    'AUTH_USERS_CIRCUIT_FAILURE_THRESHOLD=5',
    'AUTH_USERS_CIRCUIT_RESET_MS=30000',
    'AUTH_ACCESS_TOKEN_TTL_SECONDS=3600',
    'AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800',
    `AUTH_REFRESH_TOKEN_HMAC_SECRET=${randomSecret()}`,
    `AUTH_REGISTRATION_FINGERPRINT_SECRET=${randomSecret()}`,
    `AUTH_LOGIN_IDENTIFIER_HMAC_SECRET=${randomSecret()}`,
    'OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318',
    'OTEL_SERVICE_NAME=stayhub-auth-service',
  ];
  writeFileSync(envFile, `${lines.join('\n')}\n`);

  return { directory, envFile, project: `stayhub-auth-compose-${suffix}`, runtimeImage, dbPassword, redisPassword };
}

export function disposeTestEnvironment(environment: TestContainerEnvironment): void {
  rmSync(environment.directory, { recursive: true, force: true });
}

export function composeEnv(environment: TestContainerEnvironment): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AUTH_DB_PASSWORD: environment.dbPassword,
    AUTH_REDIS_PASSWORD: environment.redisPassword,
    AUTH_ENV_FILE: environment.envFile,
  };
}

export function buildRuntimeImage(engine: ContainerEngine, environment: TestContainerEnvironment, repoRoot: string): CommandResult {
  return run(
    engine,
    ['build', '--target', 'runtime', '-f', 'infra/docker/auth/Dockerfile', '-t', environment.runtimeImage, '.'],
    { cwd: repoRoot, timeoutMs: 900_000 },
  );
}

export function composeUp(engine: ContainerEngine, environment: TestContainerEnvironment, repoRoot: string): CommandResult {
  return compose(
    engine,
    ['-p', environment.project, '-f', 'docker-compose.yml', 'up', '-d', '--build'],
    { cwd: repoRoot, env: composeEnv(environment), timeoutMs: 900_000 },
  );
}

export function composeDown(engine: ContainerEngine, environment: TestContainerEnvironment, repoRoot: string): CommandResult {
  return compose(
    engine,
    ['-p', environment.project, '-f', 'docker-compose.yml', 'down', '-v', '--remove-orphans'],
    { cwd: repoRoot, env: composeEnv(environment), timeoutMs: 180_000 },
  );
}

export function removeProjectImages(engine: ContainerEngine, environment: TestContainerEnvironment): void {
  for (const service of ['auth-service', 'auth-migrate']) {
    run(engine, ['rmi', `${environment.project}_${service}`, `${environment.project}-${service}`], {});
  }
  run(engine, ['rmi', environment.runtimeImage], {});
}

export function findContainer(engine: ContainerEngine, environment: TestContainerEnvironment, service: string): string | undefined {
  const result = run(engine, ['ps', '-a', '--format', '{{.ID}} {{.Names}}'], {});
  for (const line of result.stdout.split('\n')) {
    const [id, ...names] = line.trim().split(/\s+/);
    const name = names.join(' ');
    if (id === undefined || name === '') continue;
    const matches =
      name.includes(environment.project) &&
      (name.endsWith(`_${service}_1`) || name.endsWith(`-${service}-1`));
    if (matches) return id;
  }
  return undefined;
}

export function execInContainer(engine: ContainerEngine, container: string, args: readonly string[]): CommandResult {
  return run(engine, ['exec', container, ...args], {});
}

export function containerUid(engine: ContainerEngine, container: string): string {
  return execInContainer(engine, container, ['id', '-u']).stdout.trim();
}

export function httpStatus(engine: ContainerEngine, container: string, path: string): number {
  const script = `fetch('http://127.0.0.1:3001${path}').then((response)=>process.stdout.write(String(response.status))).catch(()=>process.stdout.write('000'))`;
  const result = execInContainer(engine, container, ['node', '-e', script]);
  const status = Number(result.stdout.trim());
  return Number.isFinite(status) ? status : 0;
}

export function waitForHttpStatus(
  engine: ContainerEngine,
  container: string,
  path: string,
  expected: number,
  timeoutMs: number,
): number {
  const deadline = Date.now() + timeoutMs;
  let status = 0;
  for (;;) {
    status = httpStatus(engine, container, path);
    if (status === expected || Date.now() > deadline) return status;
    spawnSync('sleep', ['2'], {});
  }
}

export function psql(engine: ContainerEngine, container: string, sql: string): string {
  return execInContainer(engine, container, ['psql', '-U', 'stayhub_auth', '-d', 'auth_db', '-tAc', sql]).stdout.trim();
}

export function stopContainer(engine: ContainerEngine, container: string): void {
  run(engine, ['stop', container], { timeoutMs: 120_000 });
}

export function startContainer(engine: ContainerEngine, container: string): void {
  run(engine, ['start', container], { timeoutMs: 120_000 });
}

export function restartContainer(engine: ContainerEngine, container: string): void {
  run(engine, ['restart', container], { timeoutMs: 120_000 });
}

export function publishedPorts(engine: ContainerEngine, container: string): string {
  return run(engine, ['port', container], {}).stdout.trim();
}
