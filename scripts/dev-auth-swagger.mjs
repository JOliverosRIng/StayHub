#!/usr/bin/env node
// Prueba Auth con Swagger en dos modos:
//   nativo (por defecto): Postgres/Redis en contenedor + auth-service con `node dist`.
//   --service-container:  auth-service, migraciones, Postgres/Redis y stub de Users en contenedores.
// En ambos casos imprime la URL de Swagger y un service JWT listo para "Authorize".
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPKCS8, SignJWT } from 'jose';

import { startUsersStub } from './users-stub.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPOSE_TEST_FILE = 'infra/docker/auth/compose.test.yml';
const COMPOSE_BASE_FILE = 'docker-compose.yml';
const COMPOSE_DEV_FILE = 'infra/docker/auth/compose.dev.yml';
const USERS_STUB_DOCKERFILE = 'infra/docker/auth/Dockerfile.users-stub';
const TEST_PROJECT = 'stayhub-auth-test';
const DEV_PROJECT = 'stayhub-auth-dev';
const DEPS_PORTS = [55432, 56379];
const DIST_ENTRY = 'dist/apps/auth-service/main.js';

const options = parseArgs(process.argv.slice(2));
const engine = detectEngine();

function parseArgs(argv) {
  const parsed = {
    port: 3001,
    usersPort: 4010,
    skipDeps: false,
    downDeps: false,
    build: false,
    serviceContainer: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--port') parsed.port = Number(argv[(index += 1)]);
    else if (flag === '--users-port') parsed.usersPort = Number(argv[(index += 1)]);
    else if (flag === '--skip-deps') parsed.skipDeps = true;
    else if (flag === '--down-deps') parsed.downDeps = true;
    else if (flag === '--build') parsed.build = true;
    else if (flag === '--service-container') parsed.serviceContainer = true;
    else if (flag === '--help' || flag === '-h') parsed.help = true;
  }
  return parsed;
}

function detectEngine() {
  for (const candidate of ['docker', 'podman']) {
    if (spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0) return candidate;
  }
  return null;
}

function compose(args, extra = {}) {
  if (engine === null) throw new Error('No docker or podman engine available');
  const command = engine === 'podman' ? 'podman-compose' : 'docker';
  const base = engine === 'podman' ? args : ['compose', ...args];
  return spawnSync(command, base, { stdio: 'inherit', ...extra });
}

function run(program, args, extra = {}) {
  const result = spawnSync(program, args, { stdio: 'inherit', cwd: ROOT, ...extra });
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed with status ${result.status}`);
}

function rsaPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function buildConfig(containerMode) {
  const access = rsaPair();
  const inbound = rsaPair();
  const outbound = rsaPair();
  const dbPassword = 'authdev_db_pw';
  const redisPassword = 'authdev_redis_pw';

  const databaseUrl = containerMode
    ? `postgresql://stayhub_auth:${dbPassword}@auth-db:5432/auth_db?schema=public`
    : (process.env.DEV_AUTH_DATABASE_URL ??
      'postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test?schema=public');
  const redisUrl = containerMode
    ? `redis://:${redisPassword}@auth-redis:6379/0`
    : (process.env.DEV_AUTH_REDIS_URL ?? 'redis://:test_redis_password@127.0.0.1:56379/15');

  const config = {
    NODE_ENV: 'development',
    AUTH_PORT: '3001',
    AUTH_DATABASE_URL: databaseUrl,
    AUTH_REDIS_URL: redisUrl,
    AUTH_ARGON2_MEMORY_COST: '8192',
    AUTH_ARGON2_TIME_COST: '2',
    AUTH_ARGON2_PARALLELISM: '1',
    AUTH_JWT_ACTIVE_KID: 'dev-access',
    AUTH_JWT_PRIVATE_KEY: access.privateKey,
    AUTH_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'dev-access': access.publicKey }),
    AUTH_JWT_ISSUER: 'https://auth.stayhub.test',
    AUTH_JWT_AUDIENCE: 'stayhub-api',
    AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON: JSON.stringify({ 'dev-inbound': inbound.publicKey }),
    AUTH_INBOUND_SERVICE_ISSUER: 'stayhub-dev-gateway',
    AUTH_INBOUND_SERVICE_AUDIENCE: 'stayhub-auth-service-dev',
    AUTH_INBOUND_SERVICE_SCOPE: 'auth:invoke',
    AUTH_OUTBOUND_SERVICE_PRIVATE_KEY: outbound.privateKey,
    AUTH_OUTBOUND_SERVICE_KID: 'dev-outbound',
    AUTH_OUTBOUND_SERVICE_ISSUER: 'stayhub-auth-service-dev',
    AUTH_OUTBOUND_SERVICE_AUDIENCE: 'stayhub-users-service-dev',
    AUTH_OUTBOUND_SERVICE_SCOPE: 'users:identity',
    AUTH_OUTBOUND_SERVICE_TTL_SECONDS: '60',
    USERS_SERVICE_URL: containerMode ? 'http://users-stub:4000' : `http://127.0.0.1:${options.usersPort}`,
    AUTH_USERS_TIMEOUT_MS: '2000',
    AUTH_USERS_CIRCUIT_FAILURE_THRESHOLD: '5',
    AUTH_USERS_CIRCUIT_RESET_MS: '30000',
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '3600',
    AUTH_SESSION_ABSOLUTE_TTL_SECONDS: '604800',
    AUTH_REFRESH_TOKEN_HMAC_SECRET: randomBytes(48).toString('base64url'),
    AUTH_REGISTRATION_FINGERPRINT_SECRET: randomBytes(48).toString('base64url'),
    AUTH_LOGIN_IDENTIFIER_HMAC_SECRET: randomBytes(48).toString('base64url'),
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    OTEL_SERVICE_NAME: 'stayhub-auth-service-dev',
    AUTH_SWAGGER_SERVER_URL: '/',
  };
  return { config, inbound, dbPassword, redisPassword };
}

function serializeEnvFile(config) {
  return `${Object.entries(config)
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, '\\n')}`)
    .join('\n')}\n`;
}

function waitPort(port, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Timed out waiting for 127.0.0.1:${port}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitReady(port, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastResult = 'sin respuesta';
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`, {
        signal: AbortSignal.timeout(2_000),
      });
      const ready = response.ok;
      lastResult = `HTTP ${response.status}`;
      await response.arrayBuffer();
      if (ready) return;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(`auth-service did not become ready on port ${port}; ultimo resultado: ${lastResult}`);
    }
    await sleep(500);
  }
}

async function issueInboundServiceToken(config, inbound) {
  const key = await importPKCS8(inbound.privateKey, 'RS256');
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: config.AUTH_INBOUND_SERVICE_SCOPE })
    .setProtectedHeader({ alg: 'RS256', kid: 'dev-inbound', typ: 'JWT' })
    .setSubject('local-dev-gateway')
    .setIssuer(config.AUTH_INBOUND_SERVICE_ISSUER)
    .setAudience(config.AUTH_INBOUND_SERVICE_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(key);
}

function printHelpers(port, token, containerMode) {
  console.log(`\n==================== LISTO PARA PROBAR ====================
Modo        : ${containerMode ? 'auth-service en contenedor' : 'auth-service nativo'}
Swagger UI  : http://127.0.0.1:${port}/docs
Service JWT : ${token}

Pasos en Swagger:
  1. Abre la URL, pulsa "Authorize" y pega el Service JWT (sin "Bearer ").
  2. Ejecuta POST /internal/v1/registrations con header Idempotency-Key (UUID).
  3. Luego POST /internal/v1/login con el mismo correo y contraseña.
  4. Usa el refreshToken en POST /internal/v1/sessions/refresh.
  5. Valida sesión en POST /internal/v1/sessions/validate (sessionId/userId del login).

El stub de Users está en memoria: al reiniciar se olvidan los usuarios.
Ctrl+C para detener todo.
==========================================================\n`);
}

function printHelp() {
  console.log(`Uso: node scripts/dev-auth-swagger.mjs [opciones]

Opciones:
  --port <n>             Puerto HTTP de auth-service (por defecto 3001)
  --users-port <n>       Puerto del stub de Users nativo (por defecto 4010)
  --service-container    Corre auth-service, migraciones, DB/Redis y stub de Users en contenedores
  --skip-deps            No levantar Postgres/Redis nativos (modo nativo)
  --down-deps            Bajar Postgres/Redis al salir (modo nativo)
  --build                Forzar la compilación de auth-service (modo nativo)
  -h, --help             Esta ayuda

Guía completa y troubleshooting: docs/dev-swagger.md
`);
}

async function runNative() {
  if (!options.skipDeps && engine === null) {
    throw new Error('Instala docker o podman para levantar Postgres/Redis, o usa --skip-deps');
  }
  const { config, inbound } = buildConfig(false);
  console.log(`\n[dev-auth] modo=nativo engine=${engine ?? 'ninguno'} puerto=${options.port} users-stub=${options.usersPort}\n`);

  if (!options.skipDeps) {
    const alreadyUp = (await Promise.all(DEPS_PORTS.map((port) => portInUse(port)))).every(Boolean);
    if (alreadyUp) {
      console.log('[dev-auth] reutilizando Postgres/Redis de stayhub-auth-test ya levantados');
    } else {
      console.log('[dev-auth] levantando Postgres y Redis de pruebas...');
      const up = compose(['-p', TEST_PROJECT, '-f', COMPOSE_TEST_FILE, 'up', '-d'], { cwd: ROOT });
      if (up.status !== 0) throw new Error('No se pudieron levantar las dependencias');
      await Promise.all(DEPS_PORTS.map((port) => waitPort(port)));
    }
  }

  console.log('[dev-auth] generando cliente Prisma...');
  run('npm', ['run', 'prisma:generate']);
  if (options.build || !existsSync(`${ROOT}/${DIST_ENTRY}`)) {
    console.log('[dev-auth] compilando auth-service...');
    run('npm', ['run', 'build']);
  }

  console.log('[dev-auth] aplicando migraciones...');
  run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'apps/auth-service/prisma/schema.prisma'], {
    env: { ...process.env, AUTH_DATABASE_URL: config.AUTH_DATABASE_URL },
  });

  const usersServer = await startUsersStub(options.usersPort, {
    log: (line) => console.log(`[users-stub] ${line}`),
  });
  console.log(`[dev-auth] stub de Users en http://127.0.0.1:${options.usersPort}`);

  console.log('[dev-auth] arrancando auth-service...');
  const child = spawn(process.execPath, [DIST_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, ...config },
    stdio: 'inherit',
  });

  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    child.kill('SIGTERM');
    await new Promise((resolve) => usersServer.close(resolve));
    if (!options.skipDeps && options.downDeps && engine !== null) {
      compose(['-p', TEST_PROJECT, '-f', COMPOSE_TEST_FILE, 'down', '-v'], { cwd: ROOT });
    }
    process.exit(code);
  };
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));
  child.on('exit', (code) => void shutdown(code ?? 1));

  await waitReady(options.port);
  const token = await issueInboundServiceToken(config, inbound);
  printHelpers(options.port, token, false);
}

async function runContainer() {
  if (engine === null) {
    throw new Error('Instala docker o podman para correr el servicio en contenedor');
  }
  const { config, inbound, dbPassword, redisPassword } = buildConfig(true);
  console.log(`\n[dev-auth] modo=container engine=${engine} puerto=${options.port}\n`);

  const directory = mkdtempSync(join(tmpdir(), 'auth-swagger-docker-'));
  const envFile = join(directory, '.env');
  writeFileSync(envFile, serializeEnvFile(config));

  const composeArgs = ['-p', DEV_PROJECT, '-f', COMPOSE_BASE_FILE, '-f', COMPOSE_DEV_FILE];
  const composeEnv = {
    ...process.env,
    AUTH_ENV_FILE: envFile,
    AUTH_DB_PASSWORD: dbPassword,
    AUTH_REDIS_PASSWORD: redisPassword,
    AUTH_DEV_PORT: String(options.port),
  };

  console.log('[dev-auth] construyendo y levantando el stack (auth, migrate, db, redis, users-stub)...');
  const up = compose([...composeArgs, 'up', '-d', '--build'], { cwd: ROOT, env: composeEnv });
  if (up.status !== 0) {
    compose([...composeArgs, 'down', '-v', '--remove-orphans'], { cwd: ROOT, env: composeEnv });
    throw new Error('No se pudo levantar el stack de contenedores');
  }

  // Los contenedores no son procesos hijos y las Promises pendientes no mantienen
  // vivo el event loop de Node. Crear el handle antes del primer await evita que el
  // script termine durante readiness o durante el firmado asíncrono del JWT.
  const keepAliveTimer = setInterval(() => undefined, 60_000);
  let shuttingDown = false;
  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(keepAliveTimer);
    console.log('\n[dev-auth] bajando el stack de contenedores...');
    compose([...composeArgs, 'down', '-v', '--remove-orphans'], { cwd: ROOT, env: composeEnv });
    rmSync(directory, { recursive: true, force: true });
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  try {
    console.log(`[dev-auth] esperando readiness en http://127.0.0.1:${options.port}/health/ready...`);
    await waitReady(options.port);
  } catch (error) {
    console.error('[dev-auth] diagnostico: estado y logs de auth-migrate/auth-service');
    compose([...composeArgs, 'ps', '--all'], { cwd: ROOT, env: composeEnv });
    compose(
      [...composeArgs, 'logs', '--no-color', '--tail', '200', 'auth-migrate', 'auth-service'],
      { cwd: ROOT, env: composeEnv },
    );
    shutdown(1);
    throw error;
  }

  console.log('[dev-auth] auth-service listo; generando Service JWT...');
  const token = await issueInboundServiceToken(config, inbound);
  printHelpers(options.port, token, true);

  // El temporizador mantiene el proceso activo hasta Ctrl+C; shutdown lo libera.
  await new Promise(() => undefined);
}

async function main() {
  if (options.help) {
    printHelp();
    return;
  }
  if (options.serviceContainer) await runContainer();
  else await runNative();
}

void main().catch((error) => {
  console.error(`\n[dev-auth] error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
