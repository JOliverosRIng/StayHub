#!/usr/bin/env node
// Prueba Auth y Users con Swagger en dos modos:
//   nativo (por defecto): PostgreSQL de Auth y Users + Redis en contenedores;
//                         auth-service y users-service reales como procesos `node dist`.
//   --service-container:  auth-service, users-service, migraciones, PostgreSQL y Redis
//                         reales en contenedores (sin stub de Users).
// En ambos modos el recorrido es real de extremo a extremo (registro -> login -> perfil)
// usando la configuración persistente generada por `npm run env:auth:dev`.
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPKCS8, SignJWT } from 'jose';

import {
  buildGatewayEnvironment,
  ensureDevEnvironment,
  GATEWAY_SECRET_FILES,
  parseEnv,
  SECRET_FILES,
  INBOUND_AUDIENCE,
  INBOUND_ISSUER,
  INBOUND_KID,
  INBOUND_SCOPE,
} from './lib/dev-env.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPOSE_BASE_FILE = 'docker-compose.yml';
const COMPOSE_DEV_FILE = 'infra/docker/auth/compose.dev.yml';
const COMPOSE_DEPS_FILE = 'infra/docker/dev/compose.deps.yml';
const DEV_PROJECT = 'stayhub-auth-dev';
const DEPS_PROJECT = 'stayhub-auth-users-dev';
const AUTH_DIST_ENTRY = 'dist/apps/auth-service/main.js';
const USERS_DIST_ENTRY = 'dist/apps/users-service/main.js';
const GATEWAY_DIST_ENTRY = 'dist/apps/api-gateway/main.js';
const USERS_PORT = 3002;
const GATEWAY_PORT = 8080;
const DEFAULT_DEPS_PORTS = { authDb: 55433, usersDb: 55434, redis: 56380, gatewayRedis: 56381 };

const options = parseArgs(process.argv.slice(2));
const engine = detectEngine();

function parseArgs(argv) {
  const parsed = {
    port: 3001,
    usersPort: undefined,
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

async function waitReady(port, timeoutMs = 120_000, label = 'servicio') {
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
      throw new Error(`${label} did not become ready on port ${port}; ultimo resultado: ${lastResult}`);
    }
    await sleep(500);
  }
}

// Readiness HTTPS del Gateway confiando solo en su certificado autofirmado de desarrollo.
function httpsStatus(url, ca) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ca, timeout: 2_000 }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

async function waitGatewayReady(ca, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastResult = 'sin respuesta';
  for (;;) {
    try {
      const status = await httpsStatus(`https://127.0.0.1:${GATEWAY_PORT}/health/ready`, ca);
      lastResult = `HTTP ${status}`;
      if (status === 200) return;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(`api-gateway did not become ready on port ${GATEWAY_PORT}; ultimo resultado: ${lastResult}`);
    }
    await sleep(500);
  }
}

// Firma el service JWT de desarrollo con el par persistente Gateway -> Auth.
async function issueServiceToken(gatewayPrivateKey) {
  const key = await importPKCS8(gatewayPrivateKey, 'RS256');
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: INBOUND_SCOPE })
    .setProtectedHeader({ alg: 'RS256', kid: INBOUND_KID, typ: 'JWT' })
    .setSubject('local-dev-gateway')
    .setIssuer(INBOUND_ISSUER)
    .setAudience(INBOUND_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(key);
}

function printReady(mode, port, token) {
  const persistence =
    mode === 'nativo'
      ? 'Los datos persisten en los volúmenes de desarrollo (auth-dev-db-data, users-dev-db-data).'
      : 'Los datos persisten en los volúmenes de Compose (auth-db-data, users_data).';
  const stop =
    mode === 'nativo'
      ? 'Ctrl+C detiene los dos procesos; las dependencias quedan arriba (usa --down-deps).'
      : 'Ctrl+C baja el stack de contenedores y conserva los volúmenes.';
  console.log(`\n==================== LISTO PARA PROBAR ====================
Modo         : ${mode} (Gateway, Auth y Users reales)
Gateway      : https://127.0.0.1:${GATEWAY_PORT}/api/v1  (certificado autofirmado)
Gateway Swag.: https://127.0.0.1:${GATEWAY_PORT}/docs
Auth Swagger : http://127.0.0.1:${port}/docs
Users Swagger: http://127.0.0.1:${USERS_PORT}/docs
Service JWT  : ${token}

Pasos (Gateway, Swagger público, sin service JWT):
  a. POST /api/v1/auth/register con header Idempotency-Key (UUID).
  b. POST /api/v1/auth/login: devuelve accessToken y la cookie stayhub_refresh.
  c. Authorize con el accessToken; GET /api/v1/auth/validate.
  d. POST /api/v1/auth/refresh (usa la cookie) y GET /api/v1/users/{userId}/profile.

Pasos (Auth directo, Swagger interno):
  1. Authorize con el Service JWT (sin "Bearer ").
  2. POST /internal/v1/registrations con header Idempotency-Key (UUID).
  3. POST /internal/v1/login con el mismo correo y contraseña.
     Guarda el "accessToken" de la respuesta.

Pasos (Users, Swagger):
  4. Abre http://127.0.0.1:${USERS_PORT}/docs, Authorize con el "accessToken"
     del login (sin "Bearer ").
  5. GET /internal/v1/users/{userId}/profile. Usa el userId del login/registro.
  6. PATCH multipart con el JSON en el campo "profile" y "expectedVersion".

${persistence}
${stop}
==========================================================\n`);
}

function printHelp() {
  console.log(`Uso: node scripts/dev-auth-swagger.mjs [opciones]

Modo nativo (por defecto): levanta PostgreSQL de Auth y Users y Redis (Auth y Gateway)
en contenedores, aplica migraciones y arranca users-service, auth-service y api-gateway (HTTPS 8080).
No hay stub de Users. El service JWT se firma con la configuración persistente.

Opciones:
  --port <n>             Puerto HTTP de auth-service (por defecto 3001)
  --service-container    Corre Auth, Users, migraciones, PostgreSQL y Redis en contenedores
  --skip-deps            No levanta contenedores; usa DEV_AUTH_DATABASE_URL, DEV_USERS_DATABASE_URL y DEV_AUTH_REDIS_URL
  --down-deps            Baja las dependencias al salir (conserva los volúmenes)
  --build                Fuerza la compilación de auth-service y users-service
  -h, --help             Esta ayuda

El modo nativo conserva datos y claves entre reinicios en .env y secrets/.
Para regenerar la configuración desde cero, elimina .env y secrets/ y ejecuta
npm run env:auth:dev.

Variables de puertos de dependencias (opcionales):
  DEV_AUTH_DB_PORT (55433), DEV_USERS_DB_PORT (55434), DEV_REDIS_PORT (56380)

Guía completa y troubleshooting: docs/dev-swagger.md
`);
}

// Configuración persistente compartida por Auth y Users (task-02).
function loadNativeConfig() {
  const dev = ensureDevEnvironment({ root: ROOT });
  const env = Object.fromEntries(parseEnv(readFileSync(dev.envPath, 'utf8')));
  const readSecret = (name) => readFileSync(join(dev.secretsDir, name), 'utf8').trim();
  const usersDbPassword = readSecret(SECRET_FILES.usersDbPassword);
  const gatewayPrivate = readSecret(SECRET_FILES.gatewayPrivate);

  const authDbPort = Number(process.env.DEV_AUTH_DB_PORT ?? DEFAULT_DEPS_PORTS.authDb);
  const usersDbPort = Number(process.env.DEV_USERS_DB_PORT ?? DEFAULT_DEPS_PORTS.usersDb);
  const redisPort = Number(process.env.DEV_REDIS_PORT ?? DEFAULT_DEPS_PORTS.redis);
  const gatewayRedisPort = Number(
    process.env.DEV_GATEWAY_REDIS_PORT ?? DEFAULT_DEPS_PORTS.gatewayRedis,
  );

  const authDatabaseUrl =
    process.env.DEV_AUTH_DATABASE_URL ??
    `postgresql://stayhub_auth:${env.AUTH_DB_PASSWORD}@127.0.0.1:${authDbPort}/auth_db?schema=public`;
  const redisUrl =
    process.env.DEV_AUTH_REDIS_URL ??
    `redis://:${env.AUTH_REDIS_PASSWORD}@127.0.0.1:${redisPort}/0`;
  const usersDatabaseUrl =
    process.env.DEV_USERS_DATABASE_URL ??
    `postgresql://users:${usersDbPassword}@127.0.0.1:${usersDbPort}/users_db`;

  return {
    env,
    secretsDir: dev.secretsDir,
    gatewayPrivate,
    authDatabaseUrl,
    redisUrl,
    usersDatabaseUrl,
    authDbPort,
    usersDbPort,
    redisPort,
    gatewayRedisPort,
    depsPasswords: {
      authDb: env.AUTH_DB_PASSWORD,
      usersDb: usersDbPassword,
      redis: env.AUTH_REDIS_PASSWORD,
    },
  };
}

function buildAuthEnvironment(config) {
  return {
    ...config.env,
    NODE_ENV: 'development',
    AUTH_PORT: String(options.port),
    AUTH_DATABASE_URL: config.authDatabaseUrl,
    AUTH_REDIS_URL: config.redisUrl,
    USERS_SERVICE_URL: `http://127.0.0.1:${USERS_PORT}`,
    AUTH_SWAGGER_SERVER_URL: config.env.AUTH_SWAGGER_SERVER_URL ?? '/',
  };
}

function buildUsersEnvironment(config) {
  return {
    NODE_ENV: 'development',
    USERS_PORT: String(USERS_PORT),
    USERS_DATABASE_URL: config.usersDatabaseUrl,
    USERS_DATABASE_URL_FILE: '',
    USERS_JWT_ISSUER: config.env.USERS_JWT_ISSUER,
    USERS_JWT_AUDIENCE: config.env.USERS_JWT_AUDIENCE,
    USERS_JWT_KID: config.env.USERS_JWT_KID,
    USERS_JWT_PUBLIC_KEY_FILE: join(config.secretsDir, SECRET_FILES.accessPublic),
    USERS_SERVICE_JWT_ISSUER: config.env.USERS_SERVICE_JWT_ISSUER,
    USERS_SERVICE_JWT_AUDIENCE: config.env.USERS_SERVICE_JWT_AUDIENCE,
    USERS_SERVICE_JWT_KID: config.env.USERS_SERVICE_JWT_KID,
    USERS_SERVICE_JWT_PUBLIC_KEY_FILE: join(config.secretsDir, SECRET_FILES.servicePublic),
    USERS_REGISTRATION_SCOPE: config.env.USERS_REGISTRATION_SCOPE,
    USERS_LOOKUP_SCOPE: config.env.USERS_LOOKUP_SCOPE,
    USERS_MAX_PHOTO_BYTES: '5000000',
    USERS_SWAGGER_SERVER_URL: `http://127.0.0.1:${USERS_PORT}`,
    OTEL_EXPORTER_OTLP_ENDPOINT: config.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://127.0.0.1:4318',
  };
}

function depsEnvironment(config) {
  return {
    ...process.env,
    DEV_AUTH_DB_PASSWORD: config.depsPasswords.authDb,
    DEV_USERS_DB_PASSWORD: config.depsPasswords.usersDb,
    DEV_AUTH_REDIS_PASSWORD: config.depsPasswords.redis,
    DEV_AUTH_DB_PORT: String(config.authDbPort),
    DEV_USERS_DB_PORT: String(config.usersDbPort),
    DEV_REDIS_PORT: String(config.redisPort),
    DEV_GATEWAY_REDIS_PORT: String(config.gatewayRedisPort),
    DEV_GATEWAY_REDIS_PASSWORD_FILE: join(config.secretsDir, GATEWAY_SECRET_FILES.redisPassword),
  };
}

async function startDevDependencies(config) {
  if (engine === null) {
    throw new Error('Instala docker o podman para levantar PostgreSQL/Redis, o usa --skip-deps');
  }
  const alreadyUp = (await Promise.all([
    portInUse(config.authDbPort),
    portInUse(config.usersDbPort),
    portInUse(config.redisPort),
    portInUse(config.gatewayRedisPort),
  ])).every(Boolean);
  if (alreadyUp) {
    console.log('[dev-auth] reutilizando PostgreSQL/Redis de desarrollo ya levantados');
    return;
  }
  console.log('[dev-auth] levantando PostgreSQL (auth, users) y Redis (auth, gateway) de desarrollo...');
  const up = compose(['-p', DEPS_PROJECT, '-f', COMPOSE_DEPS_FILE, 'up', '-d'], {
    cwd: ROOT,
    env: depsEnvironment(config),
  });
  if (up.status !== 0) throw new Error('No se pudieron levantar las dependencias');
  await Promise.all([
    waitPort(config.authDbPort),
    waitPort(config.usersDbPort),
    waitPort(config.redisPort),
    waitPort(config.gatewayRedisPort),
  ]);
}

function buildNativeGatewayEnvironment(config) {
  return buildGatewayEnvironment(config.env, {
    secretsDir: config.secretsDir,
    authBaseUrl: `http://127.0.0.1:${options.port}`,
    usersBaseUrl: `http://127.0.0.1:${USERS_PORT}`,
    redisHostPort: `127.0.0.1:${config.gatewayRedisPort}`,
    paths: {
      tlsCert: join(config.secretsDir, GATEWAY_SECRET_FILES.tlsCert),
      tlsKey: join(config.secretsDir, GATEWAY_SECRET_FILES.tlsKey),
      redisPassword: join(config.secretsDir, GATEWAY_SECRET_FILES.redisPassword),
      servicePrivateKey: join(config.secretsDir, SECRET_FILES.gatewayPrivate),
    },
  });
}

async function runNative() {
  const config = loadNativeConfig();
  console.log(`\n[dev-auth] modo=nativo engine=${engine ?? 'ninguno'} auth=${options.port} users=${USERS_PORT}\n`);

  if (!options.skipDeps) await startDevDependencies(config);

  console.log('[dev-auth] generando clientes Prisma...');
  run('npm', ['run', 'prisma:auth:generate']);
  run('npm', ['run', 'prisma:users:generate']);

  if (
    options.build ||
    ![AUTH_DIST_ENTRY, USERS_DIST_ENTRY, GATEWAY_DIST_ENTRY].every((entry) => existsSync(`${ROOT}/${entry}`))
  ) {
    console.log('[dev-auth] compilando auth-service, users-service y api-gateway...');
    run('npm', ['run', 'build:auth']);
    run('npm', ['run', 'build:users']);
    run('npm', ['run', 'build:gateway']);
  }

  console.log('[dev-auth] aplicando migraciones...');
  run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'apps/auth-service/prisma/schema.prisma'], {
    env: { ...process.env, AUTH_DATABASE_URL: config.authDatabaseUrl },
  });
  run(process.execPath, ['scripts/users-migrate.cjs'], {
    env: {
      ...process.env,
      USERS_DATABASE_URL: config.usersDatabaseUrl,
      USERS_DATABASE_URL_FILE: '',
    },
  });

  console.log('[dev-auth] arrancando users-service real...');
  const usersChild = spawn(process.execPath, [USERS_DIST_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, ...buildUsersEnvironment(config) },
    stdio: 'inherit',
  });

  console.log('[dev-auth] arrancando auth-service...');
  const authChild = spawn(process.execPath, [AUTH_DIST_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, ...buildAuthEnvironment(config) },
    stdio: 'inherit',
  });

  let gatewayChild;
  let shuttingDown = false;
  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    gatewayChild?.kill('SIGTERM');
    authChild.kill('SIGTERM');
    usersChild.kill('SIGTERM');
    if (!options.skipDeps && options.downDeps && engine !== null) {
      console.log('[dev-auth] bajando dependencias (se conservan los volúmenes)...');
      compose(['-p', DEPS_PROJECT, '-f', COMPOSE_DEPS_FILE, 'down'], {
        cwd: ROOT,
        env: depsEnvironment(config),
      });
    }
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  authChild.on('exit', (code) => shutdown(code ?? 1));
  usersChild.on('exit', (code) => shutdown(code ?? 1));

  console.log(`[dev-auth] esperando readiness de users-service en http://127.0.0.1:${USERS_PORT}/health/ready...`);
  await waitReady(USERS_PORT, 120_000, 'users-service');
  console.log(`[dev-auth] esperando readiness de auth-service en http://127.0.0.1:${options.port}/health/ready...`);
  await waitReady(options.port, 120_000, 'auth-service');

  console.log('[dev-auth] arrancando api-gateway (HTTPS 8080)...');
  gatewayChild = spawn(process.execPath, [GATEWAY_DIST_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, ...buildNativeGatewayEnvironment(config) },
    stdio: 'inherit',
  });
  gatewayChild.on('exit', (code) => shutdown(code ?? 1));
  const ca = readFileSync(join(config.secretsDir, GATEWAY_SECRET_FILES.tlsCert));
  console.log(`[dev-auth] esperando readiness de api-gateway en https://127.0.0.1:${GATEWAY_PORT}/health/ready...`);
  await waitGatewayReady(ca, 120_000);

  const token = await issueServiceToken(config.gatewayPrivate);
  printReady('nativo', options.port, token);
}

// Compose monta los secretos de archivo conservando el modo 0600 del host, que los
// usuarios no root de los contenedores (postgres/node) no pueden leer. Copiarlos a un
// directorio temporal legible evita ese fallo sin relajar los secretos en disco.
function stageReadableSecrets(secretsDir) {
  const directory = mkdtempSync(join(tmpdir(), 'stayhub-dev-secrets-'));
  chmodSync(directory, 0o755);
  const env = {};
  const mapping = {
    USERS_DB_PASSWORD_FILE: SECRET_FILES.usersDbPassword,
    USERS_DATABASE_URL_FILE: SECRET_FILES.usersDatabaseUrl,
    USERS_JWT_PUBLIC_KEY_FILE: SECRET_FILES.accessPublic,
    USERS_SERVICE_JWT_PUBLIC_KEY_FILE: SECRET_FILES.servicePublic,
    GATEWAY_TLS_CERT_SOURCE: GATEWAY_SECRET_FILES.tlsCert,
    GATEWAY_TLS_KEY_SOURCE: GATEWAY_SECRET_FILES.tlsKey,
    GATEWAY_REDIS_PASSWORD_SOURCE: GATEWAY_SECRET_FILES.redisPassword,
    GATEWAY_SERVICE_PRIVATE_KEY_SOURCE: SECRET_FILES.gatewayPrivate,
  };
  for (const [variable, file] of Object.entries(mapping)) {
    const staged = join(directory, file);
    copyFileSync(join(secretsDir, file), staged);
    chmodSync(staged, 0o444);
    env[variable] = staged;
  }
  // Variables del Gateway en un env_file temporal: `.env` no se modifica.
  const devEnv = Object.fromEntries(parseEnv(readFileSync(join(secretsDir, '..', '.env'), 'utf8')));
  const gatewayEnv = buildGatewayEnvironment(devEnv, {
    secretsDir,
    authBaseUrl: 'http://auth-service:3001',
    usersBaseUrl: 'http://users-service:3002',
    redisHostPort: 'gateway-redis:6379',
    paths: {
      tlsCert: '/run/secrets/gateway_tls_cert',
      tlsKey: '/run/secrets/gateway_tls_key',
      redisPassword: '/run/secrets/gateway_redis_password',
      servicePrivateKey: '/run/secrets/gateway_service_private_key',
    },
  });
  const gatewayEnvFile = join(directory, 'gateway.env');
  writeFileSync(
    gatewayEnvFile,
    `${Object.entries(gatewayEnv).map(([key, value]) => `${key}=${value}`).join('\n')}\n`,
    { mode: 0o444 },
  );
  env.GATEWAY_ENV_FILE = gatewayEnvFile;
  return { directory, env };
}

async function runContainer() {
  if (engine === null) {
    throw new Error('Instala docker o podman para correr el stack en contenedores');
  }
  const dev = ensureDevEnvironment({ root: ROOT });
  const gatewayPrivate = readFileSync(join(dev.secretsDir, SECRET_FILES.gatewayPrivate), 'utf8').trim();
  const staged = stageReadableSecrets(dev.secretsDir);
  console.log(`\n[dev-auth] modo=container engine=${engine} auth=${options.port} users=${USERS_PORT}\n`);

  const composeArgs = ['-p', DEV_PROJECT, '-f', COMPOSE_BASE_FILE, '-f', COMPOSE_DEV_FILE];
  const composeEnv = {
    ...process.env,
    AUTH_ENV_FILE: '.env',
    AUTH_DEV_PORT: String(options.port),
    USERS_DEV_PORT: String(USERS_PORT),
    ...staged.env,
  };

  console.log('[dev-auth] construyendo y levantando el stack (gateway, auth, users, migraciones, db, redis)...');
  // Los secretos se montan desde un directorio temporal nuevo en cada arranque.
  // podman-compose no recrea contenedores existentes, así que se bajan antes
  // (sin -v: los volúmenes y los datos se conservan).
  compose([...composeArgs, 'down', '--remove-orphans'], { cwd: ROOT, env: composeEnv });
  const up = compose([...composeArgs, 'up', '-d', '--build'], { cwd: ROOT, env: composeEnv });
  if (up.status !== 0) {
    compose([...composeArgs, 'down', '--remove-orphans'], { cwd: ROOT, env: composeEnv });
    rmSync(staged.directory, { recursive: true, force: true });
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
    console.log('\n[dev-auth] bajando el stack de contenedores (se conservan los volúmenes)...');
    compose([...composeArgs, 'down', '--remove-orphans'], { cwd: ROOT, env: composeEnv });
    rmSync(staged.directory, { recursive: true, force: true });
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  try {
    console.log(`[dev-auth] esperando readiness de users-service en http://127.0.0.1:${USERS_PORT}/health/ready...`);
    await waitReady(USERS_PORT, 180_000, 'users-service');
    console.log(`[dev-auth] esperando readiness de auth-service en http://127.0.0.1:${options.port}/health/ready...`);
    await waitReady(options.port, 180_000, 'auth-service');
    console.log(`[dev-auth] esperando readiness de api-gateway en https://127.0.0.1:${GATEWAY_PORT}/health/ready...`);
    await waitGatewayReady(readFileSync(join(dev.secretsDir, GATEWAY_SECRET_FILES.tlsCert)), 240_000);
  } catch (error) {
    console.error('[dev-auth] diagnostico: estado y logs de migraciones y servicios');
    compose([...composeArgs, 'ps', '--all'], { cwd: ROOT, env: composeEnv });
    compose(
      [
        ...composeArgs,
        'logs',
        '--no-color',
        '--tail',
        '200',
        'auth-migrate',
        'auth-service',
        'users-migrate',
        'users-service',
        'gateway-redis',
        'api-gateway',
      ],
      { cwd: ROOT, env: composeEnv },
    );
    shutdown(1);
    throw error;
  }

  const token = await issueServiceToken(gatewayPrivate);
  printReady('contenedor', options.port, token);

  // El temporizador mantiene el proceso activo hasta Ctrl+C; shutdown lo libera.
  await new Promise(() => undefined);
}

async function main() {
  if (options.help) {
    printHelp();
    return;
  }
  if (options.usersPort !== undefined) {
    throw new Error(
      '--users-port se retiró: users-service real escucha en 3002 en ambos modos; usa --port para Auth',
    );
  }
  if (options.serviceContainer) await runContainer();
  else await runNative();
}

void main().catch((error) => {
  console.error(`\n[dev-auth] error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
