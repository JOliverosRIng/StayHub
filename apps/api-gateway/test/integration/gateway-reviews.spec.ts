import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { importSPKI, jwtVerify } from 'jose';

import { ReviewsClient } from '@gateway/infrastructure/http/reviews.client';
import { ReviewsServiceTokenProvider } from '@gateway/infrastructure/service-auth/service-token.provider';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly authorization: string;
  readonly requestId: string;
  readonly body: string;
}

describe('Gateway -> Reviews communication', () => {
  let server: Server;
  let baseUrl: string;
  const captured: CapturedRequest[] = [];

  beforeAll(async () => {
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      let body = '';
      request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
      request.on('end', () => {
        captured.push({
          method: request.method ?? '', url: request.url ?? '', body,
          authorization: String(request.headers.authorization ?? ''),
          requestId: String(request.headers['x-request-id'] ?? ''),
        });
        if ((request.url ?? '').includes('conflict=true')) {
          response.writeHead(409, { 'content-type': 'application/problem+json' });
          response.end(JSON.stringify({ code: 'REVIEW_ALREADY_EXISTS' }));
          return;
        }
        const isPage = request.method === 'GET';
        response.writeHead(isPage ? 200 : 201, { 'content-type': 'application/json' });
        response.end(JSON.stringify(isPage
          ? { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }
          : { id: '54ad5cec-60d5-4f2d-a8ef-948fdbeb63d1', propertyId: '6254cf44-328d-47d7-92b6-2258668f82a3', rating: 5, comment: 'Excelente', createdAt: '2026-11-09T12:00:00.000Z' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('stub not listening');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => { captured.length = 0; });

  function client(): { reviews: ReviewsClient; publicKey: string } {
    const fixture = createTestGatewayConfig({ GATEWAY_REVIEWS_BASE_URL: baseUrl });
    const token = new ReviewsServiceTokenProvider(fixture.config);
    return { reviews: new ReviewsClient(fixture.config, token), publicKey: fixture.servicePublicKeyPem };
  }

  it('uses a Reviews-specific service JWT and propagates x-request-id for public reads', async () => {
    const { reviews, publicKey } = client();
    await expect(reviews.listProperty('6254cf44-328d-47d7-92b6-2258668f82a3', '?page=1&pageSize=20', 'trace-reviews-001')).resolves.toMatchObject({ total: 0 });

    const call = captured[0];
    expect(call).toMatchObject({ method: 'GET', url: '/internal/v1/properties/6254cf44-328d-47d7-92b6-2258668f82a3/reviews?page=1&pageSize=20', requestId: 'trace-reviews-001' });
    const key = await importSPKI(publicKey, 'RS256');
    const token = call?.authorization.replace(/^Bearer /u, '') ?? '';
    const verified = await jwtVerify(token, key, { issuer: 'stayhub-api-gateway', audience: 'stayhub-reviews-service' });
    expect(verified.payload.scope).toBe('reviews:read');
  });

  it('forwards only the validated user bearer for create and own-history calls', async () => {
    const { reviews } = client();
    const context = { traceId: 'trace-reviews-002', bearer: 'validated-user-token' };
    await reviews.create({ bookingId: '0426db67-b650-4fb6-b334-7f91a2151a63', rating: 5, comment: 'Excelente' }, context);
    await reviews.listOwn('ace1f067-f307-49af-8d48-6b262701af14', '?page=2', context);

    expect(captured).toHaveLength(2);
    expect(captured.every((call) => call.authorization === 'Bearer validated-user-token')).toBe(true);
    expect(captured.every((call) => call.requestId === 'trace-reviews-002')).toBe(true);
    expect(JSON.parse(captured[0]?.body ?? '{}')).toEqual({ bookingId: '0426db67-b650-4fb6-b334-7f91a2151a63', rating: 5, comment: 'Excelente' });
  });

  it('maps a Reviews Problem Details status instead of leaking a remote body', async () => {
    const { reviews } = client();
    await expect(reviews.listOwn('ace1f067-f307-49af-8d48-6b262701af14', '?conflict=true', { traceId: 'trace-reviews-003', bearer: 'validated-user-token' }))
      .rejects.toMatchObject({ status: 409 });
  });
});
