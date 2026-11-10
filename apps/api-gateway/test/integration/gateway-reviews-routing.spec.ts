import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { INestApplication } from '@nestjs/common';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';

import { startGateway } from '../../src/main';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const PROPERTY_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';

interface ReviewCall { readonly method: string; readonly url: string; readonly authorization: string; readonly requestId: string; }
interface Reply { readonly status: number; readonly contentType: string; readonly body: Record<string, unknown>; }

describe('public Gateway routes -> Reviews', () => {
  const calls: ReviewCall[] = [];
  let stub: Server;
  let app: INestApplication;
  let bearer: string;
  let fixture: ReturnType<typeof createTestGatewayConfig>;
  const originalEnv = process.env;

  beforeAll(async () => {
    stub = createServer((request: IncomingMessage, response: ServerResponse) => {
      const url = request.url ?? '';
      request.resume();
      request.on('end', () => {
        if (url === '/internal/v1/sessions/validate') {
          return json(response, 200, { active: true, role: 'GUEST' });
        }
        if (url.startsWith('/internal/v1/')) {
          calls.push({
            method: request.method ?? '', url,
            authorization: String(request.headers.authorization ?? ''),
            requestId: String(request.headers['x-request-id'] ?? ''),
          });
          if (request.method === 'POST') {
            return json(response, 201, { id: randomUUID(), propertyId: PROPERTY_ID, rating: 5, comment: 'Excelente', createdAt: new Date().toISOString() });
          }
          return json(response, 200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
        }
        return json(response, 404, { code: 'NOT_FOUND' });
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const address = stub.address();
    if (address === null || typeof address === 'string') throw new Error('stub not listening');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    fixture = createTestGatewayConfig({ GATEWAY_AUTH_BASE_URL: baseUrl, GATEWAY_REVIEWS_BASE_URL: baseUrl });
    process.env = { ...originalEnv, ...fixture.env };
    bearer = await mintBearer(fixture.servicePrivateKeyPem, Object.keys(fixture.config.userJwt.publicKeys)[0] ?? '', fixture.config.userJwt.issuer, fixture.config.userJwt.audience);
    app = await startGateway(fixture.config);
  }, 30000);

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    process.env = originalEnv;
  });

  beforeEach(() => { calls.length = 0; });

  it('routes the anonymous property query with a valid Reviews service token', async () => {
    const reply = await call('GET', `/api/v1/properties/${PROPERTY_ID}/reviews?page=1&pageSize=20`);
    expect(reply.status).toBe(200);
    expect(calls[0]?.url).toBe(`/internal/v1/properties/${PROPERTY_ID}/reviews?page=1&pageSize=20`);
    const key = await importSPKI(fixture.servicePublicKeyPem, 'RS256');
    const token = calls[0]?.authorization.replace(/^Bearer /u, '') ?? '';
    const verified = await jwtVerify(token, key, { issuer: 'stayhub-api-gateway', audience: 'stayhub-reviews-service' });
    expect(verified.payload.scope).toBe('reviews:read');
    expect(calls[0]?.requestId).toHaveLength(36);
  });

  it('routes create and own history with the validated user bearer', async () => {
    const created = await call('POST', '/api/v1/reviews', bearer, { bookingId: BOOKING_ID, rating: 5, comment: 'Excelente' });
    const history = await call('GET', `/api/v1/reviews/user/${USER_ID}?page=1`, bearer);
    expect(created.status).toBe(201);
    expect(history.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls.every((entry) => entry.authorization === `Bearer ${bearer}`)).toBe(true);
  });

  it('rejects another user history before contacting Reviews', async () => {
    const reply = await call('GET', `/api/v1/reviews/user/${OTHER_ID}`, bearer);
    expect(reply.status).toBe(403);
    expect(reply.contentType).toContain('application/problem+json');
    expect(calls).toHaveLength(0);
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
        response.on('end', () => resolve({ status: response.statusCode ?? 0, contentType: String(response.headers['content-type'] ?? ''), body: JSON.parse(responseBody || '{}') as Record<string, unknown> }));
      });
      request.on('error', reject);
      if (raw !== undefined) request.write(raw);
      request.end();
    });
  }
});

function json(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function mintBearer(privateKey: string, kid: string, issuer: string, audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'GUEST', sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setSubject(USER_ID).setIssuer(issuer).setAudience(audience).setIssuedAt(now)
    .setExpirationTime(now + 3600).setJti(randomUUID())
    .sign(await importPKCS8(privateKey, 'RS256'));
}
