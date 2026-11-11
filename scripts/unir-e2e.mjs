#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { SignJWT, importPKCS8 } from 'jose';

const require = createRequire(import.meta.url);
const amqp = require('amqplib');
const NPM_CLI = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

const ROOT = resolve(process.cwd());
const NOTIFICATIONS_DIR = join(ROOT, 'apps/notifications-service');
const REVIEWS_DIR = join(ROOT, 'apps/reviews-service');
const ACCOMMODATIONS_DIR = join(ROOT, 'apps/accommodations-service');
const DB_CONTAINER = 'stayhub-unir-e2e-db';
const MQ_CONTAINER = 'stayhub-unir-e2e-mq';
const DB_PORT = 55440;
const MQ_PORT = 5674;
const ACCOMMODATIONS_PORT = 3003;
const BOOKINGS_PORT = 3005;
const PAYMENTS_PORT = 3006;
const NOTIFICATIONS_PORT = 3009;
const REVIEWS_PORT = 3007;
const BOOKINGS_URL = `http://127.0.0.1:${BOOKINGS_PORT}`;
const PAYMENTS_URL = `http://127.0.0.1:${PAYMENTS_PORT}`;
const NOTIFICATIONS_URL = `http://127.0.0.1:${NOTIFICATIONS_PORT}`;
const REVIEWS_URL = `http://127.0.0.1:${REVIEWS_PORT}`;
const ACCOMMODATIONS_URL = `http://127.0.0.1:${ACCOMMODATIONS_PORT}`;
const MQ_URL = `amqp://test:test@127.0.0.1:${MQ_PORT}`;
const DB_URL = (database) => `postgresql://test:test@127.0.0.1:${DB_PORT}/${database}?schema=public`;
const OWNER_ID = '00000000-0000-4000-8000-00000000a001';

const temp = mkdtempSync(join(tmpdir(), 'stayhub-unir-e2e-'));
const children = [];
const results = [];
let bookingsEnv;

function log(message) {
  process.stdout.write(`[unir-e2e] ${message}\n`);
}

function record(name, detail) {
  results.push({ name, status: 'PASS', detail });
  log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function run(command, args, options = {}) {
  const executable = process.platform === 'win32' && command === 'npm' ? process.execPath : command;
  const executableArgs = process.platform === 'win32' && command === 'npm' ? [NPM_CLI, ...args] : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? 180_000,
  });
  if (result.status !== 0) {
    const stdout = (result.stdout ?? '').split('\n').slice(-120).join('\n');
    const stderr = (result.stderr ?? '').split('\n').slice(-120).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  return result.stdout ?? '';
}

function runAsync(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const executable = process.platform === 'win32' && command === 'npm' ? process.execPath : command;
    const executableArgs = process.platform === 'win32' && command === 'npm' ? [NPM_CLI, ...args] : args;
    const child = spawn(executable, executableArgs, {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectPromise(new Error(`${command} ${args.join(' ')} timed out`));
    }, options.timeout ?? 180_000);
    child.on('error', (error) => { clearTimeout(timer); rejectPromise(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(stdout);
      else rejectPromise(new Error(`${command} ${args.join(' ')} failed (${code})\nSTDOUT:\n${stdout.split('\n').slice(-80).join('\n')}\nSTDERR:\n${stderr.split('\n').slice(-100).join('\n')}`));
    });
  });
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function dockerSucceeds(args) {
  return spawnSync('docker', args, { cwd: ROOT, env: process.env, stdio: 'ignore' }).status === 0;
}

function psql(database, sql) {
  return docker([
    'exec', DB_CONTAINER, 'psql', '-U', 'test', '-d', database, '-tAc', sql,
  ]).trim();
}

function migrationEnvironment(extra) {
  const env = { ...process.env, ...extra };
  delete env.BOOKINGS_DATABASE_URL_FILE;
  delete env.PAYMENTS_DATABASE_URL_FILE;
  delete env.NOTIFICATIONS_DATABASE_URL_FILE;
  delete env.REVIEWS_DATABASE_URL_FILE;
  return env;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function tcpReachable(port) {
  return new Promise((resolvePromise) => {
    const socket = netConnect({ host: '127.0.0.1', port }, () => { socket.destroy(); resolvePromise(true); });
    socket.on('error', () => resolvePromise(false));
    socket.setTimeout(500, () => { socket.destroy(); resolvePromise(false); });
  });
}

async function waitFor(predicate, label, timeoutMs = 30_000, intervalMs = 200) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(`Timeout waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

async function httpJson(method, url, { token, body, headers = {}, expected = 200 } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = text; }
  if (response.status !== expected) {
    throw new Error(`${method} ${url} expected ${expected} but got ${response.status}: ${text.slice(0, 300)}`);
  }
  return parsed;
}

async function waitForReady(baseUrl, label, timeoutMs = 60_000) {
  let last = '';
  await waitFor(async () => {
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      last = `${response.status} ${await response.text()}`;
      return response.ok;
    } catch (error) {
      last = error.message;
      return false;
    }
  }, `${label} readiness`, timeoutMs);
  return last;
}

function startService(name, command, args, cwd, env) {
  const logPath = join(temp, `${name}.log`);
  const stream = createWriteStream(logPath, { flags: 'a' });
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  child.on('exit', (code, signal) => { stream.write(`\n[process exited code=${code} signal=${signal}]\n`); });
  const entry = { name, child, logPath, stream };
  children.push(entry);
  return entry;
}

async function stopService(entry) {
  if (!entry || entry.child.exitCode !== null) return;
  entry.child.kill('SIGTERM');
  const exited = new Promise((resolvePromise) => entry.child.once('exit', resolvePromise));
  const timeout = delay(10_000).then(() => 'timeout');
  const result = await Promise.race([exited, timeout]);
  if (result === 'timeout') entry.child.kill('SIGKILL');
  entry.stream.end();
}

async function stopAllServices() {
  for (const entry of [...children].reverse()) await stopService(entry);
  children.length = 0;
}

function makeKey() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

async function signJwt(privateKey, { kid, issuer, audience, subject, role, scope, expiresIn = '4m' }) {
  const key = await importPKCS8(privateKey, 'RS256');
  const payload = { ...(role ? { role } : {}), ...(scope ? { scope } : {}) };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

async function issueRuntimeTokens() {
  const guestId = '00000000-0000-4000-8000-00000000b001';
  const guestToken = await signJwt(keys.bookings.privateKey, {
    kid: 'bookings-key', issuer: 'stayhub-e2e-gateway', audience: 'stayhub-e2e-bookings-service',
    subject: guestId, role: 'GUEST', scope: 'bookings:invoke', expiresIn: '10m',
  });
  const paymentsCharge = await signJwt(keys.payments.privateKey, {
    kid: 'payments-service', issuer: 'stayhub-e2e-payments', audience: 'stayhub-e2e-payments-service',
    subject: 'stayhub-bookings-service', scope: 'payments:charge',
  });
  const paymentsRefund = await signJwt(keys.payments.privateKey, {
    kid: 'payments-service', issuer: 'stayhub-e2e-payments', audience: 'stayhub-e2e-payments-service',
    subject: 'stayhub-bookings-service', scope: 'payments:refund',
  });
  const notificationsService = await signJwt(keys.notifications.privateKey, {
    kid: 'notifications-service', issuer: 'stayhub-e2e-notifications', audience: 'stayhub-e2e-notifications-service',
    subject: 'stayhub-bookings-service', scope: 'notifications:send',
  });
  const accommodationsQuote = await signJwt(keys.accommodations.privateKey, {
    kid: 'accommodations-service-key', issuer: 'stayhub-e2e-bookings', audience: 'stayhub-e2e-accommodations-service',
    subject: 'stayhub-bookings-service', scope: 'accommodations:booking-quote',
  });
  const ownerToken = await signJwt(keys.bookings.privateKey, {
    kid: 'bookings-key', issuer: 'stayhub-e2e-gateway', audience: 'stayhub-e2e-bookings-service',
    subject: OWNER_ID, role: 'OWNER', scope: 'bookings:invoke', expiresIn: '10m',
  });
  const reviewsServiceToken = await signJwt(keys.bookings.privateKey, {
    kid: 'bookings-key', issuer: 'stayhub-e2e-gateway', audience: 'stayhub-e2e-bookings-service',
    subject: 'stayhub-reviews-service', scope: 'reviews:eligibility', expiresIn: '10m',
  });
  const notificationsAccess = await signJwt(keys.notifications.privateKey, {
    kid: 'notifications-access', issuer: 'stayhub-e2e-notifications-access', audience: 'stayhub-e2e-notifications-access',
    subject: guestId, role: 'GUEST',
  });
  return { guestId, guestToken, ownerToken, reviewsServiceToken, accommodationsQuote, paymentsCharge, paymentsRefund, notificationsService, notificationsAccess };
}

async function publishPayments(payload, routingKey) {
  const connection = await amqp.connect(MQ_URL);
  try {
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange('stayhub.payments', 'topic', { durable: true });
    channel.publish('stayhub.payments', routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true, contentType: 'application/json', messageId: payload.eventId,
    });
    await channel.waitForConfirms();
    await channel.close();
  } finally {
    await connection.close();
  }
}

function bookingsEnvWith(overrides = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    BOOKINGS_PORT: String(BOOKINGS_PORT),
    BOOKINGS_DATABASE_URL: DB_URL('bookings_db'),
    BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'bookings-key': keys.bookings.publicKey }),
    BOOKINGS_SERVICE_JWT_ISSUER: 'stayhub-e2e-gateway',
    BOOKINGS_SERVICE_JWT_AUDIENCE: 'stayhub-e2e-bookings-service',
    BOOKINGS_SERVICE_JWT_SCOPE: 'bookings:invoke',
    BOOKINGS_REVIEWS_JWT_SCOPE: 'reviews:eligibility',
    BOOKINGS_REVIEWS_JWT_AUDIENCE: 'stayhub-e2e-bookings-service',
    BOOKINGS_ACCOMMODATIONS_URL: ACCOMMODATIONS_URL,
    BOOKINGS_PAYMENTS_URL: PAYMENTS_URL,
    BOOKINGS_DEPENDENCY_TIMEOUT_MS: '5000',
    BOOKINGS_PAYMENT_HOLD_MINUTES: '15',
    BOOKINGS_CANCELLATION_POLICY_VERSION: 'e2e-v1',
    BOOKINGS_CANCELLATION_POLICY_JSON: JSON.stringify({ version: 'e2e-v1', freeCancellationBeforeHours: 0, refundPercent: 100 }),
    BOOKINGS_NOTIFICATIONS_URL: NOTIFICATIONS_URL,
    BOOKINGS_NOTIFICATIONS_JWT_AUDIENCE: 'stayhub-e2e-notifications-service',
    BOOKINGS_NOTIFICATIONS_JWT_SCOPE: 'notifications:send',
    BOOKINGS_NOTIFICATIONS_TIMEOUT_MS: '3000',
    BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN: tokens.notificationsService,
    BOOKINGS_OUTBOUND_SERVICE_TOKEN: tokens.paymentsCharge,
    BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON: JSON.stringify({
      'accommodations-service:accommodations:booking-quote': tokens.accommodationsQuote,
      'payments-service:payments:charge': tokens.paymentsCharge,
      'payments-service:payments:refund': tokens.paymentsRefund,
    }),
    BOOKINGS_RABBITMQ_URL: MQ_URL,
    BOOKINGS_RABBITMQ_EXCHANGE: 'stayhub.bookings.v1',
    BOOKINGS_RABBITMQ_PAYMENTS_EXCHANGE: 'stayhub.payments',
    BOOKINGS_RABBITMQ_QUEUE: 'stayhub.bookings.payment-events.e2e',
    BOOKINGS_RABBITMQ_RETRY_QUEUE: 'stayhub.bookings.payment-events.e2e.retry',
    BOOKINGS_RABBITMQ_DLQ: 'stayhub.bookings.payment-events.e2e.dlq',
    BOOKINGS_RABBITMQ_PREFETCH: '10',
    BOOKINGS_RABBITMQ_MAX_RETRIES: '3',
    BOOKINGS_RABBITMQ_RETRY_DELAY_MS: '300',
    BOOKINGS_NOTIFICATION_WORK_POLL_INTERVAL_MS: '300',
    BOOKINGS_NOTIFICATION_WORK_BATCH_SIZE: '10',
    BOOKINGS_NOTIFICATION_WORK_MAX_ATTEMPTS: '20',
    BOOKINGS_NOTIFICATION_WORK_RETRY_BASE_MS: '300',
    BOOKINGS_NOTIFICATION_WORK_LEASE_MS: '30000',
    BOOKINGS_WORKER_POLL_INTERVAL_MS: '200',
    BOOKINGS_WORKER_BATCH_SIZE: '25',
    BOOKINGS_OUTBOX_BATCH_SIZE: '50',
    BOOKINGS_SHUTDOWN_GRACE_MS: '10000',
    BOOKINGS_LOG_LEVEL: 'info',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    ...overrides,
  };
}

async function startBookings(overrides = {}) {
  bookingsEnv = bookingsEnvWith(overrides);
  const entry = startService('bookings', process.execPath, [join(ROOT, 'dist/apps/bookings-service/main.js')], ROOT, bookingsEnv);
  await waitForReady(BOOKINGS_URL, 'bookings');
  return entry;
}

async function startNotifications() {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    NOTIFICATIONS_PORT: String(NOTIFICATIONS_PORT),
    NOTIFICATIONS_DATABASE_URL: DB_URL('notifications_db'),
    NOTIFICATIONS_JWT_ISSUER: 'stayhub-e2e-notifications-access',
    NOTIFICATIONS_JWT_AUDIENCE: 'stayhub-e2e-notifications-access',
    NOTIFICATIONS_JWT_KID: 'notifications-access',
    NOTIFICATIONS_JWT_PUBLIC_KEY: keys.notifications.publicKey,
    NOTIFICATIONS_SERVICE_JWT_ISSUER: 'stayhub-e2e-notifications',
    NOTIFICATIONS_SERVICE_JWT_AUDIENCE: 'stayhub-e2e-notifications-service',
    NOTIFICATIONS_SERVICE_JWT_KID: 'notifications-service',
    NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY: keys.notifications.publicKey,
    NOTIFICATIONS_SEND_SCOPE: 'notifications:send',
    NOTIFICATIONS_EMAIL_MODE: 'stub',
  };
  const entry = startService('notifications', process.execPath, [join(NOTIFICATIONS_DIR, 'dist/main.js')], NOTIFICATIONS_DIR, env);
  await waitForReady(NOTIFICATIONS_URL, 'notifications');
  return entry;
}

async function startPayments() {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    PAYMENTS_PORT: String(PAYMENTS_PORT),
    PAYMENTS_DATABASE_URL: DB_URL('payments_db'),
    PAYMENTS_JWT_ISSUER: 'stayhub-e2e-payments-access',
    PAYMENTS_JWT_AUDIENCE: 'stayhub-e2e-payments-access',
    PAYMENTS_JWT_KID: 'payments-access',
    PAYMENTS_JWT_PUBLIC_KEY: keys.payments.publicKey,
    PAYMENTS_SERVICE_JWT_ISSUER: 'stayhub-e2e-payments',
    PAYMENTS_SERVICE_JWT_AUDIENCE: 'stayhub-e2e-payments-service',
    PAYMENTS_SERVICE_JWT_KID: 'payments-service',
    PAYMENTS_SERVICE_JWT_PUBLIC_KEY: keys.payments.publicKey,
    PAYMENTS_CHARGE_SCOPE: 'payments:charge',
    PAYMENTS_REFUND_SCOPE: 'payments:refund',
    PAYMENTS_READ_SCOPE: 'payments:read',
    PAYMENTS_ALLOWED_CURRENCIES: 'COP,USD',
    PAYMENTS_TOKEN_HMAC_SECRET: 'stayhub-e2e-token-hmac-secret-0123456789abcdef',
    PAYMENTS_RABBITMQ_URL: MQ_URL,
    PAYMENTS_RABBITMQ_EXCHANGE: 'stayhub.payments',
    PAYMENTS_OUTBOX_POLL_INTERVAL_MS: '200',
    PAYMENTS_OUTBOX_BATCH_SIZE: '50',
    PAYMENTS_RECONCILER_INTERVAL_MS: '1000',
    PAYMENTS_RECONCILER_BATCH_SIZE: '10',
    PAYMENTS_RECONCILER_MAX_ATTEMPTS: '5',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
  };
  const entry = startService('payments', process.execPath, [join(ROOT, 'dist/apps/payments-service/main.js')], ROOT, env);
  await waitForReady(PAYMENTS_URL, 'payments');
  return entry;
}

async function startAccommodations() {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    ACCOMMODATIONS_PORT: String(ACCOMMODATIONS_PORT),
    ACCOMMODATIONS_DATABASE_URL: DB_URL('accommodations_db'),
    ACCOMMODATIONS_JWT_ISSUER: 'stayhub-e2e-gateway',
    ACCOMMODATIONS_JWT_AUDIENCE: 'stayhub-e2e-accommodations-service',
    ACCOMMODATIONS_JWT_KID: 'accommodations-key',
    ACCOMMODATIONS_JWT_PUBLIC_KEY: keys.accommodations.publicKey,
    ACCOMMODATIONS_SERVICE_JWT_ISSUER: 'stayhub-e2e-bookings',
    ACCOMMODATIONS_SERVICE_JWT_AUDIENCE: 'stayhub-e2e-accommodations-service',
    ACCOMMODATIONS_SERVICE_JWT_KID: 'accommodations-service-key',
    ACCOMMODATIONS_SERVICE_JWT_PUBLIC_KEY: keys.accommodations.publicKey,
    ACCOMMODATIONS_BOOKING_QUOTE_SCOPE: 'accommodations:booking-quote',
    ACCOMMODATIONS_PHOTO_STORAGE_ROOT: join(temp, 'accommodations-photos'),
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
  };
  const entry = startService('accommodations', process.execPath, [join(ACCOMMODATIONS_DIR, 'dist/main.js')], ACCOMMODATIONS_DIR, env);
  await waitForReady(ACCOMMODATIONS_URL, 'accommodations');
  return entry;
}

let keys;
let tokens;
let bookingsProcess;

async function setup() {
  log(`temporary directory: ${temp}`);
  docker(['rm', '-f', DB_CONTAINER, MQ_CONTAINER]);
  run('docker', ['run', '-d', '--rm', '--name', DB_CONTAINER, '-p', `127.0.0.1:${DB_PORT}:5432`,
    '-e', 'POSTGRES_DB=postgres', '-e', 'POSTGRES_USER=test', '-e', 'POSTGRES_PASSWORD=test',
    'postgres:16-alpine']);
  run('docker', ['run', '-d', '--rm', '--name', MQ_CONTAINER, '-p', `127.0.0.1:${MQ_PORT}:5672`,
    '-e', 'RABBITMQ_DEFAULT_USER=test', '-e', 'RABBITMQ_DEFAULT_PASS=test',
    'rabbitmq:3.13-alpine']);
  await waitFor(() => tcpReachable(DB_PORT), 'PostgreSQL TCP');
  await waitFor(() => dockerSucceeds(['exec', DB_CONTAINER, 'pg_isready', '-U', 'test', '-d', 'postgres']), 'PostgreSQL readiness');
  await waitFor(() => tcpReachable(MQ_PORT), 'RabbitMQ TCP');

  for (const database of ['accommodations_db', 'bookings_db', 'payments_db', 'notifications_db', 'reviews_db']) {
    psql('postgres', `CREATE DATABASE ${database}`);
  }

  keys = {
    bookings: makeKey(),
    payments: makeKey(),
    notifications: makeKey(),
    accommodations: makeKey(),
  };
  log('building services');
  if (!existsSync(join(NOTIFICATIONS_DIR, 'node_modules/nodemailer/package.json'))) {
    run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: NOTIFICATIONS_DIR, timeout: 600_000 });
  }
  run('npm', ['run', 'prisma:payments:generate']);
  run('npm', ['run', 'prisma:bookings:generate']);
  run('npm', ['run', 'prisma:reviews:generate']);
  run('npm', ['run', 'prisma:accommodations:generate']);
  run('npm', ['run', 'prisma:generate'], { cwd: NOTIFICATIONS_DIR });
  run('npm', ['run', 'build:payments']);
  run('npm', ['run', 'build:bookings']);
  run('npm', ['run', 'build'], { cwd: NOTIFICATIONS_DIR });
  run('npm', ['run', 'build:reviews']);
  run('npm', ['run', 'build:accommodations']);

  log('applying migrations');
  run('npm', ['run', 'prisma:bookings:migrate:deploy'], { env: migrationEnvironment({ BOOKINGS_DATABASE_URL: DB_URL('bookings_db') }) });
  run('npm', ['run', 'prisma:payments:migrate:deploy'], { env: migrationEnvironment({ PAYMENTS_DATABASE_URL: DB_URL('payments_db') }) });
  run('npm', ['run', 'prisma:migrate:deploy'], { cwd: NOTIFICATIONS_DIR, env: migrationEnvironment({ NOTIFICATIONS_DATABASE_URL: DB_URL('notifications_db') }) });
  run('npm', ['run', 'prisma:reviews:migrate:deploy'], { env: migrationEnvironment({ REVIEWS_DATABASE_URL: DB_URL('reviews_db') }) });
  run('npm', ['run', 'prisma:migrate:deploy'], { cwd: ACCOMMODATIONS_DIR, env: migrationEnvironment({ ACCOMMODATIONS_DATABASE_URL: DB_URL('accommodations_db') }) });

  tokens = await issueRuntimeTokens();
  await startAccommodations();
  await startPayments();
  await startNotifications();
  bookingsProcess = await startBookings();
  await startReviews();
}

async function startReviews() {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'production',
    REVIEWS_PORT: String(REVIEWS_PORT),
    REVIEWS_DATABASE_URL: DB_URL('reviews_db'),
    REVIEWS_USER_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'bookings-key': keys.bookings.publicKey }),
    REVIEWS_USER_JWT_ISSUER: 'stayhub-e2e-gateway',
    REVIEWS_USER_JWT_AUDIENCE: 'stayhub-e2e-bookings-service',
    REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'bookings-key': keys.bookings.publicKey }),
    REVIEWS_GATEWAY_JWT_ISSUER: 'stayhub-e2e-gateway',
    REVIEWS_GATEWAY_JWT_AUDIENCE: 'stayhub-e2e-reviews-service',
    REVIEWS_GATEWAY_JWT_SCOPE: 'reviews:read',
    REVIEWS_BOOKINGS_BASE_URL: BOOKINGS_URL,
    REVIEWS_BOOKINGS_TIMEOUT_MS: '3000',
    REVIEWS_BOOKINGS_SERVICE_TOKEN: tokens.reviewsServiceToken,
    REVIEWS_SHUTDOWN_GRACE_MS: '10000',
    REVIEWS_LOG_LEVEL: 'info',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
  };
  const entry = startService('reviews', process.execPath, [join(ROOT, 'dist/apps/reviews-service/main.js')], ROOT, env);
  await waitForReady(REVIEWS_URL, 'reviews');
  return entry;
}

async function getBooking(id) {
  const row = psql('bookings_db', `SELECT status, "paymentStatus", "paymentOrderId", "guestId" FROM bookings WHERE id=${sqlString(id)}`);
  if (!row) throw new Error(`Booking ${id} not found`);
  const [status, paymentStatus, paymentOrderId, guestId] = row.split('|');
  return { status, paymentStatus, paymentOrderId, guestId };
}

async function countRows(database, sql) {
  return Number(psql(database, sql));
}

async function createBooking({ propertyId = randomUUID(), roomId = randomUUID(), checkIn = '2035-06-01', checkOut = '2035-06-03', guests = 1 } = {}) {
  ensureAccommodation(propertyId, roomId);
  const body = await httpJson('POST', `${BOOKINGS_URL}/bookings`, {
    token: tokens.guestToken,
    headers: { 'Idempotency-Key': `unir-${randomUUID()}` },
    body: { propertyId, roomId, checkIn, checkOut, guests },
    expected: 201,
  });
  return body.id;
}

function ensureAccommodation(propertyId, roomId) {
  psql('accommodations_db', `INSERT INTO \"Property\" (id, \"ownerId\", type, name, \"addressLine\", city, region, country, status, version, \"createdAt\", \"updatedAt\") VALUES (${sqlString(propertyId)}::uuid, ${sqlString(OWNER_ID)}::uuid, 'APARTMENT', 'E2E Property', 'E2E Address', 'Bogota', 'Bogota', 'CO', 'PUBLISHED', 1, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`);
  psql('accommodations_db', `INSERT INTO \"Room\" (id, \"propertyId\", name, capacity, \"basePriceAmount\", \"basePriceCurrency\", \"createdAt\", \"updatedAt\") VALUES (${sqlString(roomId)}::uuid, ${sqlString(propertyId)}::uuid, 'E2E Room', 2, 100.00, 'USD', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`);
}

async function waitConfirmed(id, timeoutMs = 30_000) {
  await waitFor(async () => {
    const booking = await getBooking(id);
    return booking.status === 'CONFIRMED' && booking.paymentStatus === 'CAPTURED';
  }, `booking ${id} confirmation`, timeoutMs);
}

async function waitNotificationDelivered(bookingId, timeoutMs = 30_000) {
  await waitFor(async () => {
    const work = psql('bookings_db', `SELECT status FROM notification_work WHERE "bookingId"=${sqlString(bookingId)}`);
    const confirmations = await countRows('notifications_db', `SELECT count(*) FROM "Notification" WHERE "idempotencyKey"=${sqlString(`booking-confirmation:${bookingId}`)}`);
    const reminders = await countRows('notifications_db', `SELECT count(*) FROM "ScheduledNotification" WHERE "bookingId"=${sqlString(bookingId)}`);
    return work === 'SUCCEEDED' && confirmations === 1 && reminders === 1;
  }, `notification delivery for ${bookingId}`, timeoutMs);
}

async function scenarioApprovedAndReplay() {
  const guestId = tokens.guestId;
  const bookingId = await createBooking();
  await waitConfirmed(bookingId);
  await waitNotificationDelivered(bookingId);

  const booking = await getBooking(bookingId);
  const confirmedOutbox = await countRows('bookings_db', `SELECT count(*) FROM outbox_events WHERE "aggregateId"=${sqlString(bookingId)} AND "eventType"='booking.v1.confirmed'`);
  const workRows = psql('bookings_db', `SELECT status, attempts FROM notification_work WHERE "bookingId"=${sqlString(bookingId)}`);
  const notification = psql('notifications_db', `SELECT type, channel, status FROM "Notification" WHERE "idempotencyKey"=${sqlString(`booking-confirmation:${bookingId}`)}`);
  const reminder = psql('notifications_db', `SELECT "propertyName", "roomName", "checkIn" FROM "ScheduledNotification" WHERE "bookingId"=${sqlString(bookingId)}`);
  if (confirmedOutbox !== 1) throw new Error(`Expected one booking.v1.confirmed outbox event, got ${confirmedOutbox}`);
  if (!workRows.startsWith('SUCCEEDED|')) throw new Error(`Unexpected notification work: ${workRows}`);
  if (notification !== 'BOOKING_CONFIRMATION|IN_APP|SENT') throw new Error(`Unexpected confirmation: ${notification}`);
  if (!reminder.startsWith('E2E Property|E2E Room|2035-06-01')) throw new Error(`Unexpected reminder: ${reminder}`);
  record('approved flow', `booking ${bookingId} confirmed and notified for guest ${guestId}`);

  const payloadText = psql('payments_db', `SELECT payload::text FROM outbox_events WHERE aggregate_id=${sqlString(booking.paymentOrderId)} AND event_type='payment.v1.approved' ORDER BY created_at DESC LIMIT 1`);
  if (!payloadText) throw new Error('Approved payment event not found in Payments outbox');
  const payload = JSON.parse(payloadText);
  await publishPayments(payload, 'payment.approved');
  await delay(1500);
  const processed = await countRows('bookings_db', `SELECT count(*) FROM processed_events WHERE "eventId"=${sqlString(payload.eventId)}`);
  const confirmations = await countRows('notifications_db', `SELECT count(*) FROM "Notification" WHERE "idempotencyKey"=${sqlString(`booking-confirmation:${bookingId}`)}`);
  const reminders = await countRows('notifications_db', `SELECT count(*) FROM "ScheduledNotification" WHERE "bookingId"=${sqlString(bookingId)}`);
  if (processed !== 1 || confirmations !== 1 || reminders !== 1) throw new Error(`Replay mutated state: processed=${processed} confirmations=${confirmations} reminders=${reminders}`);
  record('event replay', 'same eventId did not duplicate booking, outbox, confirmation or reminder');
}

async function scenarioDeclined() {
  await stopService(bookingsProcess);
  bookingsProcess = await startBookings({ BOOKINGS_PAYMENTS_MOCK_TOKEN: 'tok_declined_funds' });
  try {
    const bookingId = await createBooking({ roomId: randomUUID(), checkIn: '2035-07-01', checkOut: '2035-07-03' });
    await waitFor(async () => {
      const booking = await getBooking(bookingId);
      return booking.status === 'PAYMENT_FAILED' && booking.paymentStatus === 'FAILED';
    }, `declined booking ${bookingId}`, 30_000);
    await delay(1000);
    const works = await countRows('bookings_db', `SELECT count(*) FROM notification_work WHERE "bookingId"=${sqlString(bookingId)}`);
    const confirmations = await countRows('notifications_db', `SELECT count(*) FROM "Notification" WHERE "idempotencyKey"=${sqlString(`booking-confirmation:${bookingId}`)}`);
    const reminders = await countRows('notifications_db', `SELECT count(*) FROM "ScheduledNotification" WHERE "bookingId"=${sqlString(bookingId)}`);
    if (works !== 0 || confirmations !== 0 || reminders !== 0) throw new Error(`Declined booking generated notification work/notifications: ${works}/${confirmations}/${reminders}`);

    const declined = await getBooking(bookingId);
    await publishPayments({
      eventId: randomUUID(), eventType: 'payment.v1.approved', schemaVersion: 1, occurredAt: new Date().toISOString(),
      paymentId: declined.paymentOrderId, bookingId, payerUserId: tokens.guestId, amountMinor: 10000, currency: 'USD',
    }, 'payment.approved');
    await delay(1000);
    const afterLateApproval = await getBooking(bookingId);
    if (afterLateApproval.status !== 'PAYMENT_FAILED') throw new Error(`Late approval reactivated terminal booking: ${afterLateApproval.status}`);
    const lateWorks = await countRows('bookings_db', `SELECT count(*) FROM notification_work WHERE "bookingId"=${sqlString(bookingId)}`);
    if (lateWorks !== 0) throw new Error(`Late approval generated notification work: ${lateWorks}`);
    record('declined payment', 'booking failed without notification work/notification and ignored a late approval');
  } finally {
    await stopService(bookingsProcess);
    bookingsProcess = await startBookings();
  }
}

async function scenarioNotificationsOutageAndRestart() {
  await stopService(children.find((entry) => entry.name === 'notifications'));
  const bookingId = await createBooking({ roomId: randomUUID(), checkIn: '2035-08-01', checkOut: '2035-08-03' });
  await waitConfirmed(bookingId);
  await waitFor(async () => {
    const status = psql('bookings_db', `SELECT status FROM notification_work WHERE "bookingId"=${sqlString(bookingId)}`);
    return status === 'FAILED_RETRYABLE';
  }, `retryable notification work for ${bookingId}`, 20_000);
  const readiness = await fetch(`${BOOKINGS_URL}/health/ready`);
  const health = await readiness.json();
  if (!readiness.ok || health.status !== 'degraded' || health.canConfirmPayments !== true) {
    throw new Error(`Unexpected readiness during Notifications outage: ${readiness.status} ${JSON.stringify(health)}`);
  }
  record('notifications outage', 'work remained durable and readiness reported degraded without disabling payment confirmation');

  await stopService(bookingsProcess);
  await startNotifications();
  bookingsProcess = await startBookings();
  await waitNotificationDelivered(bookingId, 45_000);
  record('notifications recovery', 'restarted worker processed the pending notification after Notifications recovered');
}

async function scenarioConsumerRestart() {
  await stopService(bookingsProcess);
  const bookingId = randomUUID();
  const paymentId = randomUUID();
  const guestId = tokens.guestId;
  psql('bookings_db', `INSERT INTO bookings (id, "guestId", "ownerId", "propertyId", "roomId", "propertyName", "roomName", "checkIn", "checkOut", guests, "capacitySnapshot", "nightlyPriceAmount", currency, nights, "totalAmount", "accommodationVersion", "roomSourceUpdatedAt", status, "paymentStatus", "paymentOrderId", "holdExpiresAt", version, "createdAt", "updatedAt") VALUES (${sqlString(bookingId)}, ${sqlString(guestId)}, ${sqlString(OWNER_ID)}, ${sqlString(randomUUID())}, ${sqlString(randomUUID())}, 'E2E Property', 'E2E Room', '2035-09-01', '2035-09-03', 1, 2, '100.00', 'USD', 2, '200.00', 1, NOW(), 'PENDING_PAYMENT', 'ORDER_PENDING', ${sqlString(paymentId)}, NOW() + interval '15 minutes', 1, NOW(), NOW())`);
  const event = {
    eventId: randomUUID(), eventType: 'payment.v1.approved', schemaVersion: 1, occurredAt: new Date().toISOString(),
    paymentId, bookingId, payerUserId: guestId, amountMinor: 20000, currency: 'USD',
  };
  await publishPayments(event, 'payment.approved');
  bookingsProcess = await startBookings();
  await waitConfirmed(bookingId, 45_000);
  await waitNotificationDelivered(bookingId, 45_000);
  record('consumer and worker restart', 'pending payment event survived broker downtime and was confirmed after restart');
}

async function scenarioReviews() {
  const propertyId = randomUUID();
  const roomId = randomUUID();
  ensureAccommodation(propertyId, roomId);
  await runAsync('npm', ['run', 'test:e2e', '--workspace', '@stayhub/bookings-service', '--', '--runTestsByPath', 'test/e2e/bookings-reviews.e2e-spec.ts'], {
    env: {
      ...process.env,
      BOOKINGS_REVIEWS_E2E_BOOKINGS_URL: BOOKINGS_URL,
      BOOKINGS_REVIEWS_E2E_REVIEWS_URL: REVIEWS_URL,
      BOOKINGS_REVIEWS_E2E_GUEST_TOKEN: tokens.guestToken,
      BOOKINGS_REVIEWS_E2E_OWNER_TOKEN: tokens.ownerToken,
      BOOKINGS_REVIEWS_E2E_PROPERTY_ID: propertyId,
      BOOKINGS_REVIEWS_E2E_ROOM_ID: roomId,
    },
    timeout: 180_000,
  });
  record('Bookings ↔ Reviews', 'real eligibility, completed-stay review creation, duplicate and non-completed rejection passed');
}

async function scenarioRefund() {
  const propertyId = randomUUID();
  const roomId = randomUUID();
  const bookingId = await createBooking({ propertyId, roomId, checkIn: '2035-10-01', checkOut: '2035-10-03' });
  await waitConfirmed(bookingId);
  await httpJson('DELETE', `${BOOKINGS_URL}/bookings/${bookingId}`, { token: tokens.guestToken, body: {}, expected: 200 });
  await waitFor(async () => {
    const booking = await getBooking(bookingId);
    return booking.status === 'CANCELLED_BY_GUEST' && booking.paymentStatus === 'REFUNDED';
  }, `refund completion for ${bookingId}`, 30_000);
  const booking = await getBooking(bookingId);
  if (booking.status !== 'CANCELLED_BY_GUEST') throw new Error(`Refund reactivated booking status: ${booking.status}`);
  await httpJson('POST', `${BOOKINGS_URL}/bookings`, {
    token: tokens.guestToken,
    headers: { 'Idempotency-Key': `unir-overlap-${randomUUID()}` },
    body: { propertyId, roomId, checkIn: '2035-10-02', checkOut: '2035-10-04', guests: 1 },
    expected: 201,
  });
  record('refund and availability', 'refund completed and overlapping booking remained available');
}

async function main() {
  try {
    await setup();
    await scenarioApprovedAndReplay();
    await scenarioDeclined();
    await scenarioNotificationsOutageAndRestart();
    await scenarioConsumerRestart();
    await scenarioReviews();
    await scenarioRefund();
    log(`\nE2E summary: ${results.length} scenarios PASS`);
    return 0;
  } catch (error) {
    process.stderr.write(`[unir-e2e] FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
    try {
      process.stderr.write(`\n--- bookings rows ---\n${psql('bookings_db', 'SELECT id,status,"paymentStatus",coalesce("paymentOrderId"::text,\' - \') FROM bookings ORDER BY "createdAt" DESC LIMIT 5')}\n`);
      process.stderr.write(`\n--- payment_work ---\n${psql('bookings_db', 'SELECT id,operation,status,attempts,coalesce("lastErrorCode",\' - \') FROM payment_work ORDER BY id LIMIT 10')}\n`);
      process.stderr.write(`\n--- payments ---\n${psql('payments_db', 'SELECT id,status FROM payments ORDER BY created_at DESC LIMIT 5')}\n`);
      process.stderr.write(`\n--- payments_outbox ---\n${psql('payments_db', 'SELECT event_type,status,attempts FROM outbox_events ORDER BY created_at DESC LIMIT 5')}\n`);
      process.stderr.write(`\n--- bookings_outbox ---\n${psql('bookings_db', 'SELECT "eventType", attempts, ("publishedAt" IS NOT NULL) FROM outbox_events ORDER BY "occurredAt" DESC LIMIT 5')}\n`);
    } catch {
      // Diagnostics are best-effort.
    }
    for (const entry of children) {
      try {
        const logText = require('node:fs').readFileSync(entry.logPath, 'utf8').split('\n').slice(-80).join('\n');
        process.stderr.write(`\n--- ${entry.name} log tail ---\n${logText}\n`);
      } catch {
        // Log may not exist if the process failed immediately.
      }
    }
    return 1;
  } finally {
    await stopAllServices();
    try { docker(['rm', '-f', DB_CONTAINER, MQ_CONTAINER]); } catch { /* Containers may already be gone. */ }
    try { rmSync(temp, { recursive: true, force: true }); } catch { /* Best-effort cleanup. */ }
  }
}

const code = await main();
process.exitCode = code;
