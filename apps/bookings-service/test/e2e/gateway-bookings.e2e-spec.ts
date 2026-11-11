import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { importPKCS8, SignJWT } from 'jose';

import { AppModule as GatewayAppModule } from '../../../api-gateway/src/app.module';
import { startGateway } from '../../../api-gateway/src/main';
import { createTestGatewayConfig } from '../../../api-gateway/test/support/gateway-config-fixture';
import { AppModule as BookingsAppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { ProblemDetailsFilter as BookingsProblemFilter } from '../../src/interfaces/http/problem.filter';
import { TraceInterceptor as BookingsTraceInterceptor } from '../../src/interfaces/http/trace.interceptor';
import { ClosedValidationPipe } from '../../src/interfaces/http/validation.pipe';

jest.setTimeout(180_000);

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_GUEST_ID = '33333333-3333-4333-8333-333333333333';
const RATE_WRITE_GUEST_ID = '66666666-6666-4666-8666-666666666666';
const RATE_READ_GUEST_ID = '77777777-7777-4777-8777-777777777777';
const PROPERTY_ID = '44444444-4444-4444-8444-444444444444';
const ROOM_ID = '55555555-5555-4555-8555-555555555555';
const POSTGRES_IMAGE = process.env['BOOKINGS_GATEWAY_E2E_POSTGRES_IMAGE'] ?? 'postgres:16-alpine';

interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: Record<string, unknown>;
}

describe('real Gateway <-> Bookings communication (T097)', () => {
  const originalEnv = process.env;
  const postgresContainerName = `stayhub-bookings-gateway-e2e-db-${process.pid}`;
  const redisContainerName = `stayhub-bookings-gateway-e2e-redis-${process.pid}`;
  const runtime = containerRuntime();
  let dependencyStub: Server;
  let dependencyBaseUrl: string;
  let bookingsApp: INestApplication;
  let gatewayApp: INestApplication;
  let prisma: PrismaService;
  let fixture: ReturnType<typeof createTestGatewayConfig>;
  let guestBearer: string;
  let ownerBearer: string;
  let otherGuestBearer: string;
  let rateWriteBearer: string;
  let rateReadBearer: string;

  beforeAll(async () => {
    const postgresPort = await freePort();
    const redisPort = await freePort();
    dependencyStub = createDependencyStub();
    await listen(dependencyStub);
    dependencyBaseUrl = serverUrl(dependencyStub);

    container('run', '-d', '--name', postgresContainerName,
      '-e', 'POSTGRES_DB=bookings_e2e', '-e', 'POSTGRES_USER=bookings',
      '-e', 'POSTGRES_PASSWORD=bookings-e2e-password',
      '-p', `127.0.0.1:${postgresPort}:5432`, POSTGRES_IMAGE);
    container('run', '-d', '--name', redisContainerName,
      '-p', `127.0.0.1:${redisPort}:6379`, 'redis:7-alpine',
      'redis-server', '--requirepass', 'redis-password-long-enough');
    await waitForPostgres(postgresContainerName);
    await waitForRedis(redisContainerName);

    fixture = createTestGatewayConfig({
      GATEWAY_AUTH_BASE_URL: dependencyBaseUrl,
      GATEWAY_BOOKINGS_BASE_URL: 'http://127.0.0.1:3005',
      GATEWAY_REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
    });
    const databaseUrl = `postgresql://bookings:bookings-e2e-password@127.0.0.1:${postgresPort}/bookings_e2e?schema=public`;
    process.env = {
      ...originalEnv,
      ...fixture.env,
      BOOKINGS_PORT: '3005',
      BOOKINGS_DATABASE_URL: databaseUrl,
      BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON: JSON.stringify({
        [fixture.config.serviceJwt.kid]: fixture.servicePublicKeyPem,
      }),
      BOOKINGS_SERVICE_JWT_ISSUER: fixture.config.serviceJwt.issuer,
      BOOKINGS_SERVICE_JWT_AUDIENCE: fixture.config.bookingsServiceJwt.audience,
      BOOKINGS_SERVICE_JWT_SCOPE: fixture.config.bookingsServiceJwt.scope,
      BOOKINGS_REVIEWS_JWT_SCOPE: 'reviews:eligibility',
      BOOKINGS_REVIEWS_JWT_AUDIENCE: fixture.config.bookingsServiceJwt.audience,
      BOOKINGS_ACCOMMODATIONS_URL: dependencyBaseUrl,
      BOOKINGS_PAYMENTS_URL: dependencyBaseUrl,
      BOOKINGS_NOTIFICATIONS_URL: dependencyBaseUrl,
      BOOKINGS_NOTIFICATIONS_JWT_AUDIENCE: 'stayhub-notifications-service',
      BOOKINGS_NOTIFICATIONS_JWT_SCOPE: 'notifications:send',
      BOOKINGS_DEPENDENCY_TIMEOUT_MS: '1500',
      BOOKINGS_PAYMENT_HOLD_MINUTES: '15',
      BOOKINGS_CANCELLATION_POLICY_VERSION: 'e2e-v1',
      BOOKINGS_CANCELLATION_POLICY_JSON: JSON.stringify({
        version: 'e2e-v1', freeCancellationBeforeHours: 0, refundPercent: 100,
      }),
      BOOKINGS_RABBITMQ_URL: 'amqp://127.0.0.1:1/%2F',
      BOOKINGS_SHUTDOWN_GRACE_MS: '10000',
      BOOKINGS_LOG_LEVEL: 'error',
      BOOKINGS_WORKER_POLL_INTERVAL_MS: '60000',
      BOOKINGS_NOTIFICATION_WORK_POLL_INTERVAL_MS: '60000',
      BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON: JSON.stringify({
        'accommodations-service:accommodations:booking-quote': 'e2e-accommodations-token',
        'payments-service:payments:charge': 'e2e-payments-token',
        'payments-service:payments:refund': 'e2e-refunds-token',
      }),
      BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN: 'e2e-notifications-token',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    };

    migrate(databaseUrl);
    bookingsApp = await NestFactory.create(BookingsAppModule, { logger: false });
    bookingsApp.useGlobalPipes(new ClosedValidationPipe());
    bookingsApp.useGlobalFilters(new BookingsProblemFilter());
    bookingsApp.useGlobalInterceptors(new BookingsTraceInterceptor());
    await bookingsApp.listen(3005, '127.0.0.1');
    prisma = bookingsApp.get(PrismaService);

    guestBearer = await mintBearer(fixture, GUEST_ID, 'GUEST');
    ownerBearer = await mintBearer(fixture, OWNER_ID, 'OWNER');
    otherGuestBearer = await mintBearer(fixture, OTHER_GUEST_ID, 'GUEST');
    rateWriteBearer = await mintBearer(fixture, RATE_WRITE_GUEST_ID, 'GUEST');
    rateReadBearer = await mintBearer(fixture, RATE_READ_GUEST_ID, 'GUEST');
    gatewayApp = await startGateway(fixture.config, GatewayAppModule);
  });

  afterAll(async () => {
    if (gatewayApp !== undefined) await gatewayApp.close();
    if (bookingsApp !== undefined) await bookingsApp.close();
    if (dependencyStub !== undefined) await close(dependencyStub);
    try { container('rm', '-f', postgresContainerName, redisContainerName); } catch { /* containers may not have started */ }
    process.env = originalEnv;
  });

  it('enforces authentication and roles before Bookings is invoked', async () => {
    const unauthenticated = await call('GET', `/api/v1/bookings/${randomUUID()}`);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toMatchObject({ status: 401, code: 'ACCESS_TOKEN_REQUIRED' });

    const ownerCreate = await call('POST', '/api/v1/bookings', ownerBearer, bookingCommand(), {
      'idempotency-key': `gateway-e2e-${randomUUID()}`,
    });
    expect(ownerCreate.status).toBe(403);
    expect(ownerCreate.body).toMatchObject({ status: 403, code: 'ROLE_NOT_ALLOWED' });

    const guestHistory = await call('GET', '/api/v1/bookings/history?page=1&pageSize=20', guestBearer);
    expect(guestHistory.status).toBe(403);
    expect(guestHistory.body).toMatchObject({ status: 403, code: 'ROLE_NOT_ALLOWED' });
  });

  it('creates, reads and lists a booking through both real Nest services', async () => {
    const traceId = randomUUID();
    const created = await call('POST', '/api/v1/bookings', guestBearer, bookingCommand(), {
      'idempotency-key': `gateway-e2e-${randomUUID()}`,
      'x-request-id': traceId,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ guestId: GUEST_ID, propertyId: PROPERTY_ID, roomId: ROOM_ID, status: 'PENDING_PAYMENT' });
    const bookingId = String(created.body['id']);
    const createdTransition = await prisma.bookingTransition.findFirstOrThrow({
      where: { bookingId, reasonCode: 'BOOKING_CREATED' },
    });
    expect(createdTransition.metadata).toMatchObject({ traceId: expect.stringMatching(/^[0-9a-f-]{36}$/iu) });

    const detail = await call('GET', `/api/v1/bookings/${bookingId}`, guestBearer);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: bookingId, guestId: GUEST_ID, status: 'PENDING_PAYMENT' });

    const history = await call('GET', '/api/v1/bookings/history?page=1&pageSize=20', ownerBearer);
    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(history.body['items']).toEqual(expect.arrayContaining([expect.objectContaining({ id: bookingId })]));

    const hidden = await call('GET', `/api/v1/bookings/${bookingId}`, otherGuestBearer);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('routes owner lifecycle operations and preserves remote Problem Details', async () => {
    const created = await call('POST', '/api/v1/bookings', guestBearer, bookingCommand(randomUUID()), {
      'idempotency-key': `gateway-e2e-${randomUUID()}`,
    });
    expect(created.status).toBe(201);
    const bookingId = String(created.body['id']);
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED', paymentStatus: 'CAPTURED', holdExpiresAt: null },
    });

    const checkIn = await call('POST', `/api/v1/bookings/${bookingId}/check-in`, ownerBearer);
    if (checkIn.status !== 200) throw new Error(`check-in failed: ${JSON.stringify(checkIn.body)}`);
    expect(checkIn).toMatchObject({ status: 200 });
    expect(checkIn.body).toMatchObject({ id: bookingId, status: 'CHECKED_IN' });

    const checkOut = await call('POST', `/api/v1/bookings/${bookingId}/check-out`, ownerBearer);
    expect(checkOut.status).toBe(200);
    expect(checkOut.body).toMatchObject({ id: bookingId, status: 'COMPLETED' });

    const conflict = await call('POST', `/api/v1/bookings/${bookingId}/check-in`, ownerBearer);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ status: 409, code: 'STATE_CONFLICT' });
  });

  it('enforces the approved per-user write and read quotas with Retry-After', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const reply = await call('POST', '/api/v1/bookings', rateWriteBearer, bookingCommand());
      expect(reply.status).toBe(400);
    }
    const writeLimited = await call('POST', '/api/v1/bookings', rateWriteBearer, bookingCommand());
    expect(writeLimited.status).toBe(429);
    expect(writeLimited.body).toMatchObject({ status: 429, code: 'BOOKINGS_RATE_LIMITED' });
    expect(Number(writeLimited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(writeLimited.headers['retry-after'])).toBeLessThanOrEqual(60);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const reply = await call('GET', `/api/v1/bookings/${randomUUID()}`, rateReadBearer);
      expect(reply.status).toBe(404);
    }
    const readLimited = await call('GET', `/api/v1/bookings/${randomUUID()}`, rateReadBearer);
    expect(readLimited.status).toBe(429);
    expect(readLimited.body).toMatchObject({ status: 429, code: 'BOOKINGS_RATE_LIMITED' });
    expect(Number(readLimited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(readLimited.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  function call(
    method: string,
    path: string,
    token?: string,
    body?: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const raw = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { accept: 'application/json', ...extraHeaders };
      if (token !== undefined) headers.authorization = `Bearer ${token}`;
      if (raw !== undefined) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = String(Buffer.byteLength(raw));
      }
      const request = httpsRequest({
        host: '127.0.0.1', port: 8080, path, method, servername: 'localhost', ca: fixture.tls.certPem, headers,
      }, (response) => {
        let responseBody = '';
        response.on('data', (chunk: Buffer) => { responseBody += chunk.toString('utf8'); });
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: JSON.parse(responseBody || '{}') as Record<string, unknown>,
        }));
      });
      request.on('error', reject);
      if (raw !== undefined) request.write(raw);
      request.end();
    });
  }

  function container(...args: string[]): string {
    return execFileSync(runtime, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }
});

function bookingCommand(roomId = ROOM_ID): Record<string, unknown> {
  const checkIn = new Date().toISOString().slice(0, 10);
  const checkOut = new Date(Date.parse(`${checkIn}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  return { propertyId: PROPERTY_ID, roomId, checkIn, checkOut, guests: 1 };
}

function createDependencyStub(): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const url = request.url ?? '';
      const body = parseJson(Buffer.concat(chunks).toString('utf8'));
      if (url === '/internal/v1/sessions/validate') {
        const userId = typeof body['userId'] === 'string' ? body['userId'] : '';
        return json(response, 200, { active: true, role: userId === OWNER_ID ? 'OWNER' : 'GUEST' });
      }
      if (/^\/internal\/v1\/properties\/[0-9a-f-]+\/rooms\/[0-9a-f-]+\/booking-quote\?guests=1$/iu.test(url)) {
        const roomId = url.split('/')[6] ?? ROOM_ID;
        return json(response, 200, {
          propertyId: PROPERTY_ID, roomId, ownerId: OWNER_ID, propertyName: 'Gateway E2E Property',
          roomName: 'Gateway E2E Room', propertyStatus: 'PUBLISHED', capacity: 2,
          basePrice: { amount: '25.00', currency: 'USD' }, propertyVersion: 1,
          roomUpdatedAt: '2026-01-01T00:00:00.000Z',
        });
      }
      if (url === '/payments' && request.method === 'POST') {
        return json(response, 201, {
          id: randomUUID(), bookingId: body['bookingId'], payerUserId: body['payerUserId'],
          amountMinor: body['amountMinor'], currency: body['currency'], status: 'PENDING',
        });
      }
      return json(response, 404, { code: 'NOT_FOUND' });
    });
  });
}

function parseJson(raw: string): Record<string, unknown> {
  if (raw === '') return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

function json(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function containerRuntime(): 'docker' | 'podman' {
  const configured = process.env['BOOKINGS_GATEWAY_E2E_CONTAINER_RUNTIME'];
  if (configured === 'docker' || configured === 'podman') return configured;
  if (spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0) return 'docker';
  if (spawnSync('podman', ['--version'], { stdio: 'ignore' }).status === 0) return 'podman';
  throw new Error('T097 requires Docker or Podman to run PostgreSQL 16');
}

async function waitForPostgres(containerName: string): Promise<void> {
  const runtime = containerRuntime();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      execFileSync(runtime, ['exec', containerName, 'pg_isready', '-U', 'bookings', '-d', 'bookings_e2e'], { stdio: 'ignore' });
      return;
    } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw new Error('PostgreSQL did not become ready');
}

async function waitForRedis(containerName: string): Promise<void> {
  const runtime = containerRuntime();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      execFileSync(runtime, ['exec', containerName, 'redis-cli', '-a', 'redis-password-long-enough', 'ping'], { stdio: 'ignore' });
      return;
    } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error('Redis did not become ready');
}

function migrate(databaseUrl: string): void {
  const prisma = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prisma, 'migrate', 'deploy', '--schema', join(process.cwd(), 'prisma/schema.prisma')], {
    cwd: process.cwd(), env: { ...process.env, BOOKINGS_DATABASE_URL: databaseUrl }, stdio: 'pipe',
  });
}

async function mintBearer(
  fixture: ReturnType<typeof createTestGatewayConfig>,
  userId: string,
  role: 'GUEST' | 'OWNER',
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role, sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: 'stayhub-auth-2026-01', typ: 'JWT' })
    .setSubject(userId).setIssuer(fixture.config.userJwt.issuer).setAudience(fixture.config.userJwt.audience)
    .setIssuedAt(now).setExpirationTime(now + 3600).setJti(randomUUID())
    .sign(await importPKCS8(fixture.servicePrivateKeyPem, 'RS256'));
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function serverUrl(server: Server): string {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('server not listening');
  return `http://127.0.0.1:${address.port}`;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createTcpServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') return reject(new Error('port unavailable'));
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
