import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import {
  buildRuntimeImage,
  composeDown,
  composeUp,
  containerUid,
  createTestEnvironment,
  detectEngine,
  disposeTestEnvironment,
  execInContainer,
  findContainer,
  httpStatus,
  publishedPorts,
  psql,
  removeProjectImages,
  restartContainer,
  run,
  startContainer,
  stopContainer,
  waitForHttpStatus,
  type ContainerEngine,
  type TestContainerEnvironment,
} from '../helpers/compose-harness';

jest.setTimeout(1_800_000);

const REPO_ROOT = resolve(__dirname, '../../../..');
const engine = detectEngine();

interface ComposeService {
  readonly ports?: unknown;
  readonly restart?: string;
  readonly depends_on?: Record<string, { readonly condition?: string }>;
}

interface ComposeDocument {
  readonly services: Record<string, ComposeService>;
  readonly networks: Record<string, { readonly internal?: boolean }>;
}

let environment: TestContainerEnvironment | null = null;
let serviceContainer: string | undefined;
let databaseContainer: string | undefined;
let redisContainer: string | undefined;
let migrateContainer: string | undefined;

function requireEngine(): ContainerEngine {
  if (engine === null) {
    throw new Error('No docker or podman engine available; AUTH-082 container verification cannot run');
  }
  return engine;
}

function requireEnvironment(): TestContainerEnvironment {
  if (environment === null) throw new Error('test environment was not initialised');
  return environment;
}

function requireContainer(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`container ${name} was not found`);
  return value;
}

describe('Auth container verification (AUTH-082)', () => {
  beforeAll(() => {
    if (engine === null) return;
    environment = createTestEnvironment();
    const build = buildRuntimeImage(engine, environment, REPO_ROOT);
    if (build.status !== 0) {
      throw new Error(`runtime image build failed:\n${build.stdout}\n${build.stderr}`);
    }
    const up = composeUp(engine, environment, REPO_ROOT);
    if (up.status !== 0) {
      throw new Error(`compose up failed:\n${up.stdout}\n${up.stderr}`);
    }
    serviceContainer = findContainer(engine, environment, 'auth-service');
    databaseContainer = findContainer(engine, environment, 'auth-db');
    redisContainer = findContainer(engine, environment, 'auth-redis');
    migrateContainer = findContainer(engine, environment, 'auth-migrate');
    const status = waitForHttpStatus(
      engine,
      requireContainer(serviceContainer, 'auth-service'),
      '/health/ready',
      200,
      180_000,
    );
    if (status !== 200) throw new Error(`service never became ready, last status ${status}`);
  });

  afterAll(() => {
    if (engine === null || environment === null) return;
    try {
      composeDown(engine, environment, REPO_ROOT);
    } finally {
      removeProjectImages(engine, environment);
      disposeTestEnvironment(environment);
    }
  });

  it('declares an internal compose topology without publishing services', () => {
    const document = parse(readFileSync(resolve(REPO_ROOT, 'docker-compose.yml'), 'utf8')) as unknown as ComposeDocument;

    expect(document.services['auth-db']?.ports).toBeUndefined();
    expect(document.services['auth-redis']?.ports).toBeUndefined();
    expect(document.services['auth-service']?.ports).toBeUndefined();
    expect(document.networks['auth-internal']?.internal).toBe(true);
    expect(document.networks['services']?.internal).toBe(true);
    expect(document.services['auth-service']?.restart).toBe('always');
    expect(document.services['auth-service']?.depends_on?.['auth-migrate']?.condition).toBe(
      'service_completed_successfully',
    );
    expect(document.services['auth-service']?.depends_on?.['auth-db']?.condition).toBe('service_healthy');
    expect(document.services['auth-service']?.depends_on?.['auth-redis']?.condition).toBe('service_healthy');
    expect(document.services['auth-migrate']?.depends_on?.['auth-db']?.condition).toBe('service_healthy');
  });

  it('builds a runtime image that loads the native dependencies', () => {
    const activeEngine = requireEngine();
    const activeEnvironment = requireEnvironment();

    const result = run(
      activeEngine,
      [
        'run',
        '--rm',
        '--entrypoint',
        'sh',
        activeEnvironment.runtimeImage,
        '-c',
        "id -u; test -f /app/dist/main.js && echo dist-ok; node -e \"require('argon2'); require('@prisma/client'); console.log('native-ok')\"",
      ],
      { timeoutMs: 180_000 },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dist-ok');
    expect(result.stdout).toContain('native-ok');
  });

  it('starts after migrations, without a root user and without published ports', () => {
    const activeEngine = requireEngine();
    const service = requireContainer(serviceContainer, 'auth-service');
    const database = requireContainer(databaseContainer, 'auth-db');
    const redis = requireContainer(redisContainer, 'auth-redis');
    const migrate = requireContainer(migrateContainer, 'auth-migrate');

    expect(containerUid(activeEngine, service)).not.toBe('0');
    expect(publishedPorts(activeEngine, service)).toBe('');
    expect(publishedPorts(activeEngine, database)).toBe('');
    expect(publishedPorts(activeEngine, redis)).toBe('');
    expect(httpStatus(activeEngine, service, '/health/ready')).toBe(200);
    expect(httpStatus(activeEngine, service, '/health/live')).toBe(200);

    const exitCode = run(activeEngine, ['inspect', '--format', '{{.State.ExitCode}}', migrate], {}).stdout.trim();
    expect(exitCode).toBe('0');
  });

  it('detects an incomplete schema instead of reporting ready', () => {
    const activeEngine = requireEngine();
    const service = requireContainer(serviceContainer, 'auth-service');
    const database = requireContainer(databaseContainer, 'auth-db');

    psql(
      activeEngine,
      database,
      "UPDATE _prisma_migrations SET rolled_back_at = now() WHERE migration_name = '004_session_revocation';",
    );
    expect(waitForHttpStatus(activeEngine, service, '/health/ready', 503, 30_000)).toBe(503);
    expect(httpStatus(activeEngine, service, '/health/live')).toBe(200);

    psql(
      activeEngine,
      database,
      "UPDATE _prisma_migrations SET rolled_back_at = NULL WHERE migration_name = '004_session_revocation';",
    );
    expect(waitForHttpStatus(activeEngine, service, '/health/ready', 200, 30_000)).toBe(200);
  });

  it('keeps liveness while a required dependency is down', () => {
    const activeEngine = requireEngine();
    const service = requireContainer(serviceContainer, 'auth-service');
    const redis = requireContainer(redisContainer, 'auth-redis');

    stopContainer(activeEngine, redis);
    expect(waitForHttpStatus(activeEngine, service, '/health/ready', 503, 30_000)).toBe(503);
    expect(httpStatus(activeEngine, service, '/health/live')).toBe(200);

    startContainer(activeEngine, redis);
    expect(waitForHttpStatus(activeEngine, service, '/health/ready', 200, 60_000)).toBe(200);
  });

  it('restarts without losing migrated data', () => {
    const activeEngine = requireEngine();
    const service = requireContainer(serviceContainer, 'auth-service');
    const database = requireContainer(databaseContainer, 'auth-db');

    const before = psql(
      activeEngine,
      database,
      'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;',
    );
    restartContainer(activeEngine, service);
    expect(waitForHttpStatus(activeEngine, service, '/health/ready', 200, 60_000)).toBe(200);
    const after = psql(
      activeEngine,
      database,
      'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;',
    );

    expect(after).toBe(before);
    expect(Number(after)).toBeGreaterThanOrEqual(4);
  });

  it('does not require the OTLP collector for readiness', () => {
    const activeEngine = requireEngine();
    const activeEnvironment = requireEnvironment();
    const service = requireContainer(serviceContainer, 'auth-service');

    const envContents = readFileSync(activeEnvironment.envFile, 'utf8');
    expect(envContents).toContain('OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318');
    expect(httpStatus(activeEngine, service, '/health/ready')).toBe(200);
    const probe = execInContainer(activeEngine, service, [
      'node',
      '-e',
      "fetch('http://127.0.0.1:4318/v1/traces',{method:'POST'}).then(()=>console.log('reachable')).catch(()=>console.log('unreachable'))",
    ]);
    expect(probe.stdout).toContain('unreachable');
  });
});
