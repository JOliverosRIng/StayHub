#!/usr/bin/env node
// Levanta en local, como procesos nativos, los servicios que el Gateway enruta además de Auth/Users:
// Accommodations (3003), Search (3004), Bookings (3005), Payments (3006), Reviews (3007) y
// Notifications (3009). PostgreSQL/PostGIS, RabbitMQ y Redis corren en contenedores
// (infra/docker/dev/compose.services.yml).
//
// Reutiliza las claves de `npm run env:auth:dev` (.env y secrets/):
//   - access JWT de Auth  → Accommodations, Reviews, Payments y Notifications validan al usuario;
//   - clave del Gateway   → Search, Bookings y Reviews validan el service JWT de `npm run dev:gateway`.
// Genera además una clave local de Bookings para sus tokens salientes (Accommodations, Payments,
// Notifications). Nada de esto se versiona: vive en secrets/ y .artifacts/ (ignorados por Git).
//
// Uso: npm run dev:backend [-- --build] [-- --down-deps]
import { spawn, spawnSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPKCS8, SignJWT } from 'jose';

import {
  ACCESS_KID,
  ensureDevEnvironment,
  INBOUND_ISSUER,
  INBOUND_KID,
  parseEnv,
  secret,
  SECRET_FILES,
} from './lib/dev-env.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPOSE_FILE = 'infra/docker/dev/compose.services.yml';
const COMPOSE_PROJECT = 'stayhub-services-dev';
const DB_PORT = Number(process.env.DEV_SERVICES_DB_PORT ?? 55450);
const MQ_PORT = Number(process.env.DEV_SERVICES_RABBITMQ_PORT ?? 55673);
const REDIS_PORT = Number(process.env.DEV_SERVICES_REDIS_PORT ?? 56382);
const OTEL = 'http://127.0.0.1:4318';
const BOOKINGS_ISSUER = 'stayhub-bookings-service';
const ACCOMMODATIONS_DIR = join(ROOT, 'apps', 'accommodations-service');
const NOTIFICATIONS_DIR = join(ROOT, 'apps', 'notifications-service');

const options = {
  build: process.argv.includes('--build'),
  downDeps: process.argv.includes('--down-deps'),
  help: process.argv.includes('--help') || process.argv.includes('-h'),
};

if (options.help) {
  console.log(`Uso: npm run dev:backend [-- --build] [-- --down-deps]

  --build      Fuerza prisma generate + build de todos los servicios
  --down-deps  Baja los contenedores al salir (los volúmenes se conservan)

Puertos: accommodations 3003, search 3004, bookings 3005, payments 3006, reviews 3007,
notifications 3009. PostgreSQL ${DB_PORT}, RabbitMQ ${MQ_PORT}, Redis ${REDIS_PORT} (solo 127.0.0.1).
Guía: docs/dev-local-completo.md`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Inicia con: npm run dev:backend');

function log(message) {
  console.log(`[dev-backend] ${message}`);
}

function run(program, args, extra = {}) {
  const isNpm = program === 'npm';
  const executable = isNpm ? process.execPath : program;
  const commandArgs = isNpm ? [npmCli, ...args] : args;
  const result = spawnSync(executable, commandArgs, { cwd: ROOT, stdio: 'inherit', ...extra });
  if (result.error) throw new Error(`${program} ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} terminó con código ${result.status}`);
}

const engine = ['docker', 'podman'].find((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
if (!engine) throw new Error('Se requiere Docker o Podman en ejecución');

function compose(args, env) {
  const command = engine === 'docker' ? 'docker' : 'podman-compose';
  const base = engine === 'docker' ? ['compose', ...args] : args;
  return spawnSync(command, base, { cwd: ROOT, stdio: 'inherit', env });
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitReady(name, port, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'sin respuesta';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${name} terminó durante el arranque (código ${child.exitCode}); revisa su log arriba`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(2000) });
      last = `HTTP ${response.status} ${(await response.text()).slice(0, 200)}`;
      if (response.ok) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`${name} no quedó listo en el puerto ${port}: ${last}`);
}

function persistentSecret(secretsDir, name) {
  const path = join(secretsDir, name);
  if (!existsSync(path)) writeFileSync(path, `${secret()}\n`, { mode: 0o600 });
  return readFileSync(path, 'utf8').trim();
}

function persistentRsaPair(secretsDir, name) {
  const privatePath = join(secretsDir, `${name}-private.pem`);
  if (!existsSync(privatePath)) {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    writeFileSync(privatePath, pair.privateKey, { mode: 0o600 });
  }
  const privateKey = readFileSync(privatePath, 'utf8');
  return { privateKey, publicKey: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString() };
}

async function serviceToken({ privateKey, kid, issuer, audience, subject, scope, expiresIn = '30d' }) {
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(issuer).setAudience(audience).setSubject(subject)
    .setIssuedAt().setExpirationTime(expiresIn)
    .sign(await importPKCS8(privateKey, 'RS256'));
}

/** Entorno heredado sin variables de servicios: evita que `.env` o `*_FILE` del shell se cuelen. */
function baseEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(ACCOMMODATIONS|SEARCH|BOOKINGS|REVIEWS|PAYMENTS|NOTIFICATIONS|GATEWAY|AUTH|USERS)_/u.test(key)) delete env[key];
  }
  return { ...env, NODE_ENV: 'development', OTEL_EXPORTER_OTLP_ENDPOINT: OTEL };
}

// ---------------------------------------------------------------------------
// Configuración compartida
// ---------------------------------------------------------------------------

const dev = ensureDevEnvironment({ root: ROOT });
const authEnv = Object.fromEntries(parseEnv(readFileSync(dev.envPath, 'utf8')));
const accessPublic = readFileSync(join(dev.secretsDir, SECRET_FILES.accessPublic), 'utf8');
const gatewayPrivate = readFileSync(join(dev.secretsDir, SECRET_FILES.gatewayPrivate), 'utf8');
const gatewayPublic = createPublicKey(gatewayPrivate).export({ type: 'spki', format: 'pem' }).toString();
const bookingsKeys = persistentRsaPair(dev.secretsDir, 'services-dev-bookings');
const dbPassword = persistentSecret(dev.secretsDir, 'services-dev-db-password.txt');
const mqPassword = persistentSecret(dev.secretsDir, 'services-dev-rabbitmq-password.txt');
const redisPassword = persistentSecret(dev.secretsDir, 'services-dev-redis-password.txt');
const paymentsHmac = persistentSecret(dev.secretsDir, 'services-dev-payments-hmac.txt');

const accessIssuer = authEnv.AUTH_JWT_ISSUER;
const accessAudience = authEnv.AUTH_JWT_AUDIENCE;
const dbUrl = (name) => `postgresql://stayhub_dev:${dbPassword}@127.0.0.1:${DB_PORT}/${name}?schema=public`;
const mqUrl = `amqp://stayhub_dev:${mqPassword}@127.0.0.1:${MQ_PORT}`;
const gatewayKeysJson = JSON.stringify({ [INBOUND_KID]: gatewayPublic });
const accessKeysJson = JSON.stringify({ [ACCESS_KID]: accessPublic });
const photosDir = join(ROOT, '.artifacts', 'dev-backend', 'accommodations-photos');
mkdirSync(photosDir, { recursive: true });
const tokensDir = join(ROOT, '.artifacts', 'dev-backend', 'tokens');
mkdirSync(tokensDir, { recursive: true });
const TOKEN_TTL_SECONDS = 240;
const TOKEN_REFRESH_MS = 60_000;
const TOKEN_FILES = {
  bookingsOutbound: join(tokensDir, 'bookings-outbound-service-tokens.json'),
  notifications: join(tokensDir, 'bookings-notifications-service-token.txt'),
  reviewsBookings: join(tokensDir, 'reviews-bookings-service-token.txt'),
};

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------

const SERVICES = [
  {
    name: 'accommodations', port: 3003, cwd: ACCOMMODATIONS_DIR, entry: join(ACCOMMODATIONS_DIR, 'dist', 'main.js'),
    generate: ['run', 'prisma:accommodations:generate'], build: ['run', 'build:accommodations'],
    migrate: { args: ['run', 'prisma:accommodations:migrate:deploy'], env: { ACCOMMODATIONS_DATABASE_URL: dbUrl('accommodations_db') } },
    env: () => ({
      ACCOMMODATIONS_PORT: '3003',
      ACCOMMODATIONS_DATABASE_URL: dbUrl('accommodations_db'),
      ACCOMMODATIONS_JWT_ISSUER: accessIssuer,
      ACCOMMODATIONS_JWT_AUDIENCE: accessAudience,
      ACCOMMODATIONS_JWT_KID: ACCESS_KID,
      ACCOMMODATIONS_JWT_PUBLIC_KEY: accessPublic,
      ACCOMMODATIONS_SERVICE_JWT_ISSUER: BOOKINGS_ISSUER,
      ACCOMMODATIONS_SERVICE_JWT_AUDIENCE: 'stayhub-accommodations-service',
      ACCOMMODATIONS_SERVICE_JWT_KID: 'bookings-accommodations-2026-01',
      ACCOMMODATIONS_SERVICE_JWT_PUBLIC_KEY: bookingsKeys.publicKey,
      ACCOMMODATIONS_BOOKING_QUOTE_SCOPE: 'accommodations:booking-quote',
      ACCOMMODATIONS_PHOTO_STORAGE_ROOT: photosDir,
    }),
  },
  {
    name: 'search', port: 3004, cwd: ROOT, entry: join(ROOT, 'dist', 'apps', 'search-service', 'main.js'),
    generate: ['run', 'prisma:search:generate'], build: ['run', 'build:search'],
    migrate: { args: ['run', 'prisma:search:migrate:deploy'], env: { SEARCH_DATABASE_URL: dbUrl('search_db') } },
    env: () => ({
      SEARCH_PORT: '3004',
      SEARCH_DATABASE_URL: dbUrl('search_db'),
      SEARCH_REDIS_URL: `redis://:${redisPassword}@127.0.0.1:${REDIS_PORT}/0`,
      SEARCH_RABBITMQ_URL: mqUrl,
      SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON: gatewayKeysJson,
      SEARCH_SERVICE_JWT_ISSUER: INBOUND_ISSUER,
      SEARCH_SERVICE_JWT_AUDIENCE: 'stayhub-search-service',
      SEARCH_SERVICE_JWT_SCOPE: 'search:invoke',
    }),
  },
  {
    name: 'payments', port: 3006, cwd: ROOT, entry: join(ROOT, 'dist', 'apps', 'payments-service', 'main.js'),
    generate: ['run', 'prisma:payments:generate'], build: ['run', 'build:payments'],
    migrate: { args: ['run', 'prisma:payments:migrate:deploy'], env: { PAYMENTS_DATABASE_URL: dbUrl('payments_db') } },
    env: () => ({
      PAYMENTS_PORT: '3006',
      PAYMENTS_DATABASE_URL: dbUrl('payments_db'),
      PAYMENTS_JWT_ISSUER: accessIssuer,
      PAYMENTS_JWT_AUDIENCE: accessAudience,
      PAYMENTS_JWT_KID: ACCESS_KID,
      PAYMENTS_JWT_PUBLIC_KEY: accessPublic,
      PAYMENTS_SERVICE_JWT_ISSUER: BOOKINGS_ISSUER,
      PAYMENTS_SERVICE_JWT_AUDIENCE: 'stayhub-payments-service',
      PAYMENTS_SERVICE_JWT_KID: 'bookings-payments-2026-01',
      PAYMENTS_SERVICE_JWT_PUBLIC_KEY: bookingsKeys.publicKey,
      PAYMENTS_CHARGE_SCOPE: 'payments:charge',
      PAYMENTS_REFUND_SCOPE: 'payments:refund',
      PAYMENTS_READ_SCOPE: 'payments:read',
      PAYMENTS_ALLOWED_CURRENCIES: 'COP,USD',
      PAYMENTS_TOKEN_HMAC_SECRET: paymentsHmac,
      PAYMENTS_RABBITMQ_URL: mqUrl,
      PAYMENTS_RABBITMQ_EXCHANGE: 'stayhub.payments',
    }),
  },
  {
    name: 'notifications', port: 3009, cwd: NOTIFICATIONS_DIR, entry: join(NOTIFICATIONS_DIR, 'dist', 'main.js'),
    generate: ['--prefix', NOTIFICATIONS_DIR, 'run', 'prisma:generate'], build: ['--prefix', NOTIFICATIONS_DIR, 'run', 'build'],
    migrate: { args: ['--prefix', NOTIFICATIONS_DIR, 'run', 'prisma:migrate:deploy'], env: { NOTIFICATIONS_DATABASE_URL: dbUrl('notifications_db') } },
    env: () => ({
      NOTIFICATIONS_PORT: '3009',
      NOTIFICATIONS_DATABASE_URL: dbUrl('notifications_db'),
      NOTIFICATIONS_JWT_ISSUER: accessIssuer,
      NOTIFICATIONS_JWT_AUDIENCE: accessAudience,
      NOTIFICATIONS_JWT_KID: ACCESS_KID,
      NOTIFICATIONS_JWT_PUBLIC_KEY: accessPublic,
      NOTIFICATIONS_SERVICE_JWT_ISSUER: BOOKINGS_ISSUER,
      NOTIFICATIONS_SERVICE_JWT_AUDIENCE: 'stayhub-notifications-service',
      NOTIFICATIONS_SERVICE_JWT_KID: 'bookings-notifications-2026-01',
      NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY: bookingsKeys.publicKey,
      NOTIFICATIONS_SEND_SCOPE: 'notifications:send',
      NOTIFICATIONS_EMAIL_MODE: 'stub',
    }),
  },
  {
    name: 'bookings', port: 3005, cwd: ROOT, entry: join(ROOT, 'dist', 'apps', 'bookings-service', 'main.js'),
    generate: ['run', 'prisma:bookings:generate'], build: ['run', 'build:bookings'],
    migrate: { args: ['run', 'prisma:bookings:migrate:deploy'], env: { BOOKINGS_DATABASE_URL: dbUrl('bookings_db') } },
    env: () => ({
      BOOKINGS_PORT: '3005',
      BOOKINGS_DATABASE_URL: dbUrl('bookings_db'),
      BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON: gatewayKeysJson,
      BOOKINGS_SERVICE_JWT_ISSUER: INBOUND_ISSUER,
      BOOKINGS_SERVICE_JWT_AUDIENCE: 'stayhub-bookings-service',
      BOOKINGS_SERVICE_JWT_SCOPE: 'bookings:invoke',
      BOOKINGS_REVIEWS_JWT_SCOPE: 'reviews:eligibility',
      BOOKINGS_REVIEWS_JWT_AUDIENCE: 'stayhub-bookings-service',
      BOOKINGS_ACCOMMODATIONS_URL: 'http://127.0.0.1:3003',
      BOOKINGS_PAYMENTS_URL: 'http://127.0.0.1:3006',
      BOOKINGS_NOTIFICATIONS_URL: 'http://127.0.0.1:3009',
      BOOKINGS_NOTIFICATIONS_JWT_AUDIENCE: 'stayhub-notifications-service',
      BOOKINGS_NOTIFICATIONS_JWT_SCOPE: 'notifications:send',
      BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN_FILE: TOKEN_FILES.notifications,
      BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON_FILE: TOKEN_FILES.bookingsOutbound,
      BOOKINGS_DEPENDENCY_TIMEOUT_MS: '3000',
      BOOKINGS_PAYMENT_HOLD_MINUTES: '15',
      BOOKINGS_CANCELLATION_POLICY_VERSION: 'approved-v1',
      BOOKINGS_CANCELLATION_POLICY_JSON: JSON.stringify({ version: 'approved-v1', freeCancellationBeforeHours: 48, refundPercent: 100 }),
      BOOKINGS_RABBITMQ_URL: mqUrl,
      BOOKINGS_RABBITMQ_EXCHANGE: 'stayhub.bookings.v1',
      BOOKINGS_RABBITMQ_PAYMENTS_EXCHANGE: 'stayhub.payments',
    }),
  },
  {
    name: 'reviews', port: 3007, cwd: ROOT, entry: join(ROOT, 'dist', 'apps', 'reviews-service', 'main.js'),
    generate: ['run', 'prisma:reviews:generate'], build: ['run', 'build:reviews'],
    migrate: { args: ['run', 'prisma:reviews:migrate:deploy'], env: { REVIEWS_DATABASE_URL: dbUrl('reviews_db') } },
    env: () => ({
      REVIEWS_PORT: '3007',
      REVIEWS_DATABASE_URL: dbUrl('reviews_db'),
      REVIEWS_USER_JWT_PUBLIC_KEYS_JSON: accessKeysJson,
      REVIEWS_USER_JWT_ISSUER: accessIssuer,
      REVIEWS_USER_JWT_AUDIENCE: accessAudience,
      REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON: gatewayKeysJson,
      REVIEWS_GATEWAY_JWT_ISSUER: INBOUND_ISSUER,
      REVIEWS_GATEWAY_JWT_AUDIENCE: 'stayhub-reviews-service',
      REVIEWS_GATEWAY_JWT_SCOPE: 'reviews:read',
      REVIEWS_BOOKINGS_BASE_URL: 'http://127.0.0.1:3005',
      REVIEWS_BOOKINGS_TIMEOUT_MS: '3000',
      REVIEWS_BOOKINGS_SERVICE_TOKEN_FILE: TOKEN_FILES.reviewsBookings,
    }),
  },
];

async function issueTokens() {
  // Payments, Notifications y Accommodations rechazan service JWT con más de 300 s de antigüedad.
  // Bookings y Reviews releen sus archivos de token en cada llamada, así que se rotan cada minuto.
  const expiresIn = `${TOKEN_TTL_SECONDS}s`;
  const bookingsToken = (kid, audience, scope) => serviceToken({
    privateKey: bookingsKeys.privateKey, kid, issuer: BOOKINGS_ISSUER, audience, subject: 'bookings-service', scope, expiresIn,
  });
  return {
    bookingsOutbound: {
      'accommodations-service:accommodations:booking-quote': await bookingsToken('bookings-accommodations-2026-01', 'stayhub-accommodations-service', 'accommodations:booking-quote'),
      'payments-service:payments:charge': await bookingsToken('bookings-payments-2026-01', 'stayhub-payments-service', 'payments:charge'),
      'payments-service:payments:refund': await bookingsToken('bookings-payments-2026-01', 'stayhub-payments-service', 'payments:refund'),
    },
    notifications: await bookingsToken('bookings-notifications-2026-01', 'stayhub-notifications-service', 'notifications:send'),
    reviewsBookings: await serviceToken({
      privateKey: gatewayPrivate, kid: INBOUND_KID, issuer: INBOUND_ISSUER, audience: 'stayhub-bookings-service',
      subject: 'reviews-service', scope: 'reviews:eligibility', expiresIn,
    }),
  };
}

function writeAtomic(path, contents) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, contents, { mode: 0o600 });
  renameSync(temporary, path);
}

async function refreshTokenFiles() {
  const tokens = await issueTokens();
  writeAtomic(TOKEN_FILES.bookingsOutbound, JSON.stringify(tokens.bookingsOutbound));
  writeAtomic(TOKEN_FILES.notifications, tokens.notifications);
  writeAtomic(TOKEN_FILES.reviewsBookings, tokens.reviewsBookings);
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) if (child.exitCode === null) child.kill('SIGTERM');
  if (options.downDeps) {
    log('bajando contenedores (los volúmenes se conservan)...');
    compose(['-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'down'], depsEnv());
  }
  process.exit(code);
}

function depsEnv() {
  return {
    ...process.env,
    DEV_SERVICES_DB_PASSWORD: dbPassword,
    DEV_SERVICES_RABBITMQ_PASSWORD: mqPassword,
    DEV_SERVICES_REDIS_PASSWORD: redisPassword,
    DEV_SERVICES_DB_PORT: String(DB_PORT),
    DEV_SERVICES_RABBITMQ_PORT: String(MQ_PORT),
    DEV_SERVICES_REDIS_PORT: String(REDIS_PORT),
  };
}

function startProcess(service, env) {
  const child = spawn(process.execPath, [service.entry], { cwd: service.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${service.name}] `;
  const pipe = (stream, target) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim() !== '') target.write(`${prefix}${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix}terminó con código ${code}; deteniendo el resto.`);
      shutdown(1);
    }
  });
  children.push({ service, child });
  return child;
}

async function main() {
  const busy = [];
  for (const service of SERVICES) if (await portInUse(service.port)) busy.push(`${service.name}:${service.port}`);
  if (busy.length > 0) throw new Error(`Puertos ocupados (${busy.join(', ')}). Detén la otra instancia antes de continuar.`);

  log(`levantando PostgreSQL/PostGIS (${DB_PORT}), RabbitMQ (${MQ_PORT}) y Redis (${REDIS_PORT})...`);
  const up = compose(['-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'up', '-d', '--wait'], depsEnv());
  if (up.status !== 0) throw new Error('No se pudieron levantar las dependencias de contenedores');

  if (!existsSync(join(NOTIFICATIONS_DIR, 'node_modules'))) {
    log('instalando dependencias aisladas de notifications-service (solo la primera vez)...');
    run('npm', ['--prefix', NOTIFICATIONS_DIR, 'ci', '--no-audit', '--no-fund']);
  }

  for (const service of SERVICES) {
    if (options.build || !existsSync(service.entry)) {
      log(`compilando ${service.name}...`);
      run('npm', service.generate);
      run('npm', service.build);
    }
  }

  for (const service of SERVICES) {
    log(`aplicando migraciones de ${service.name}...`);
    run('npm', service.migrate.args, { env: { ...baseEnv(), ...service.migrate.env } });
  }

  await refreshTokenFiles();
  const rotation = setInterval(() => {
    refreshTokenFiles().catch((error) => console.error(`[dev-backend] no se pudieron rotar los tokens: ${error instanceof Error ? error.message : String(error)}`));
  }, TOKEN_REFRESH_MS);
  rotation.unref();
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  for (const service of SERVICES) {
    log(`arrancando ${service.name} en http://127.0.0.1:${service.port} ...`);
    const child = startProcess(service, { ...baseEnv(), ...service.env() });
    await waitReady(service.name, service.port, child);
  }

  console.log(`
==================== SERVICIOS LISTOS ====================
Accommodations http://127.0.0.1:3003/docs
Search         http://127.0.0.1:3004/docs
Bookings       http://127.0.0.1:3005/docs
Payments       http://127.0.0.1:3006/docs
Reviews        http://127.0.0.1:3007/docs
Notifications  http://127.0.0.1:3009/docs
RabbitMQ UI    http://127.0.0.1:${process.env.DEV_SERVICES_RABBITMQ_UI_PORT ?? 15673} (usuario stayhub_dev)

Siguiente: npm run dev:gateway  y  npm run dev:web  (Auth/Users con npm run dev:swagger).
Ctrl+C detiene los procesos; los contenedores siguen arriba (usa -- --down-deps para bajarlos).
==========================================================
`);
}

main().catch((error) => {
  console.error(`\n[dev-backend] error: ${error instanceof Error ? error.message : String(error)}\n`);
  shutdown(1);
});
