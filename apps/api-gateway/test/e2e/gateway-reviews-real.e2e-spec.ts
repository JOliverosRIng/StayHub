import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { importPKCS8, SignJWT } from 'jose';

import { AppModule as ReviewsAppModule } from '../../../reviews-service/src/app.module';
import { ProblemDetailsFilter as ReviewsProblemFilter } from '../../../reviews-service/src/interfaces/http/problem.filter';
import { TraceInterceptor as ReviewsTraceInterceptor } from '../../../reviews-service/src/interfaces/http/trace.interceptor';
import { ClosedValidationPipe } from '../../../reviews-service/src/interfaces/http/validation.pipe';
import { startGateway } from '../../src/main';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

jest.setTimeout(180_000);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const POSTGRES_IMAGE = process.env['REVIEWS_E2E_POSTGRES_IMAGE'] ?? 'postgres:16-alpine';

interface Reply { readonly status: number; readonly body: Record<string, unknown>; }

describe('real Gateway <-> Reviews communication', () => {
  const originalEnv = process.env;
  const containerName = `stayhub-reviews-gateway-e2e-${process.pid}`;
  let dependencyStub: Server;
  let dependencyBaseUrl: string;
  let reviewsApp: INestApplication;
  let gatewayApp: INestApplication;
  let fixture: ReturnType<typeof createTestGatewayConfig>;
  let bearer: string;

  beforeAll(async () => {
    const postgresPort = await freePort();
    dependencyStub = createDependencyStub();
    await listen(dependencyStub);
    dependencyBaseUrl = serverUrl(dependencyStub);

    docker('run', '-d', '--name', containerName,
      '-e', 'POSTGRES_DB=reviews_e2e', '-e', 'POSTGRES_USER=reviews',
      '-e', 'POSTGRES_PASSWORD=reviews-e2e-password',
      '-p', `127.0.0.1:${postgresPort}:5432`, POSTGRES_IMAGE);
    await waitForPostgres(containerName);

    fixture = createTestGatewayConfig({
      GATEWAY_AUTH_BASE_URL: dependencyBaseUrl,
      GATEWAY_USERS_BASE_URL: dependencyBaseUrl,
      GATEWAY_REVIEWS_BASE_URL: 'http://127.0.0.1:3007',
    });
    const databaseUrl = `postgresql://reviews:reviews-e2e-password@127.0.0.1:${postgresPort}/reviews_e2e?schema=public`;
    process.env = {
      ...originalEnv,
      ...fixture.env,
      REVIEWS_PORT: '3007',
      REVIEWS_DATABASE_URL: databaseUrl,
      REVIEWS_USER_JWT_PUBLIC_KEYS_JSON: JSON.stringify({
        'stayhub-auth-2026-01': fixture.servicePublicKeyPem,
      }),
      REVIEWS_USER_JWT_ISSUER: fixture.config.userJwt.issuer,
      REVIEWS_USER_JWT_AUDIENCE: fixture.config.userJwt.audience,
      REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON: JSON.stringify({
        'gateway-2026-01': fixture.servicePublicKeyPem,
      }),
      REVIEWS_GATEWAY_JWT_ISSUER: fixture.config.serviceJwt.issuer,
      REVIEWS_GATEWAY_JWT_AUDIENCE: fixture.config.reviewsServiceJwt.audience,
      REVIEWS_GATEWAY_JWT_SCOPE: fixture.config.reviewsServiceJwt.scope,
      REVIEWS_BOOKINGS_BASE_URL: dependencyBaseUrl,
      REVIEWS_BOOKINGS_TIMEOUT_MS: '1500',
      REVIEWS_BOOKINGS_SERVICE_TOKEN: 'e2e-bookings-token',
      REVIEWS_SHUTDOWN_GRACE_MS: '10000',
      REVIEWS_LOG_LEVEL: 'error',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    };

    migrate(databaseUrl);
    reviewsApp = await NestFactory.create(ReviewsAppModule, { logger: false });
    reviewsApp.useGlobalPipes(new ClosedValidationPipe());
    reviewsApp.useGlobalFilters(new ReviewsProblemFilter());
    reviewsApp.useGlobalInterceptors(new ReviewsTraceInterceptor());
    await reviewsApp.listen(3007, '127.0.0.1');

    bearer = await mintBearer(fixture);
    gatewayApp = await startGateway(fixture.config);
  });

  afterAll(async () => {
    if (gatewayApp !== undefined) await gatewayApp.close();
    if (reviewsApp !== undefined) await reviewsApp.close();
    if (dependencyStub !== undefined) await close(dependencyStub);
    try { docker('rm', '-f', containerName); } catch { /* container may not have started */ }
    process.env = originalEnv;
  });

  it('reads an empty public page through Gateway -> real Reviews -> PostgreSQL', async () => {
    const reply = await call('GET', `/api/v1/properties/${PROPERTY_ID}/reviews?page=1&pageSize=20`);
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it('creates and then lists a review through both real Nest services', async () => {
    const created = await call('POST', '/api/v1/reviews', bearer, {
      bookingId: BOOKING_ID, rating: 5, comment: 'Comunicación real aprobada',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ propertyId: PROPERTY_ID, rating: 5 });

    const property = await call('GET', `/api/v1/properties/${PROPERTY_ID}/reviews?page=1&pageSize=20`);
    const history = await call('GET', `/api/v1/reviews/user/${USER_ID}?page=1&pageSize=20`, bearer);
    expect(property.status).toBe(200);
    expect(history.status).toBe(200);
    expect(property.body['total']).toBe(1);
    expect(history.body['total']).toBe(1);
    expect((property.body['items'] as Array<Record<string, unknown>>)[0]).not.toHaveProperty('guestId');
    expect((property.body['items'] as Array<Record<string, unknown>>)[0]).not.toHaveProperty('bookingId');
  });

  function call(method: string, path: string, token?: string, body?: Record<string, unknown>): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const raw = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { accept: 'application/json' };
      if (token !== undefined) headers.authorization = `Bearer ${token}`;
      if (raw !== undefined) { headers['content-type'] = 'application/json'; headers['content-length'] = String(Buffer.byteLength(raw)); }
      const request = httpsRequest({ host: '127.0.0.1', port: 8080, path, method, servername: 'localhost', ca: fixture.tls.certPem, headers }, (response) => {
        let responseBody = '';
        response.on('data', (chunk: Buffer) => { responseBody += chunk.toString('utf8'); });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(responseBody || '{}') as Record<string, unknown> }));
      });
      request.on('error', reject);
      if (raw !== undefined) request.write(raw);
      request.end();
    });
  }
});

function createDependencyStub(): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const url = request.url ?? '';
      if (url === '/internal/v1/sessions/validate') return json(response, 200, { active: true, role: 'GUEST' });
      if (url.startsWith(`/internal/v1/bookings/${BOOKING_ID}/review-eligibility`)) {
        return json(response, 200, { bookingId: BOOKING_ID, guestId: USER_ID, propertyId: PROPERTY_ID, eligible: true });
      }
      return json(response, 404, { code: 'NOT_FOUND' });
    });
  });
}

function json(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function waitForPostgres(container: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { docker('exec', container, 'pg_isready', '-U', 'reviews', '-d', 'reviews_e2e'); return; }
    catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw new Error('PostgreSQL did not become ready');
}

function migrate(databaseUrl: string): void {
  const prisma = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prisma, 'migrate', 'deploy', '--schema', join(process.cwd(), '../reviews-service/prisma/schema.prisma')], {
    cwd: join(process.cwd(), '../reviews-service'),
    env: { ...process.env, REVIEWS_DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

async function mintBearer(fixture: ReturnType<typeof createTestGatewayConfig>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'GUEST', sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: 'stayhub-auth-2026-01', typ: 'JWT' })
    .setSubject(USER_ID).setIssuer(fixture.config.userJwt.issuer).setAudience(fixture.config.userJwt.audience)
    .setIssuedAt(now).setExpirationTime(now + 3600).setJti(randomUUID())
    .sign(await importPKCS8(fixture.servicePrivateKeyPem, 'RS256'));
}

function listen(server: Server): Promise<void> { return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); }
function close(server: Server): Promise<void> { return new Promise((resolve) => server.close(() => resolve())); }
function serverUrl(server: Server): string { const address = server.address(); if (address === null || typeof address === 'string') throw new Error('server not listening'); return `http://127.0.0.1:${address.port}`; }
function freePort(): Promise<number> { return new Promise((resolve, reject) => { const server = createTcpServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (address === null || typeof address === 'string') return reject(new Error('port unavailable')); const port = address.port; server.close(() => resolve(port)); }); }); }
