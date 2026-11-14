import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { INestApplication } from '@nestjs/common';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';

import { startGateway } from '../../src/main';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '33333333-3333-4333-8333-333333333333';

interface UpstreamCall {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly contentType: string;
  readonly body: Buffer;
}
interface Reply { readonly status: number; readonly contentType: string; readonly body: Record<string, unknown>; }

describe('Gateway routes -> Accommodations y Search', () => {
  const calls: UpstreamCall[] = [];
  let role = 'OWNER';
  let stub: Server;
  let app: INestApplication;
  let ownerBearer: string;
  let guestBearer: string;
  let fixture: ReturnType<typeof createTestGatewayConfig>;
  const originalEnv = process.env;

  beforeAll(async () => {
    stub = createServer((request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const url = request.url ?? '';
        if (url === '/internal/v1/sessions/validate') return json(response, 200, { active: true, role });
        calls.push({
          method: request.method ?? '', url,
          authorization: request.headers.authorization,
          contentType: String(request.headers['content-type'] ?? ''),
          body: Buffer.concat(chunks),
        });
        if (url.startsWith('/internal/v1/search')) return json(response, 200, { items: [], page: 1, pageSize: 20, total: 0 });
        if (url.startsWith('/properties') && url.endsWith('/photos')) return json(response, 201, { id: randomUUID(), position: 1 });
        if (url === `/properties/${PROPERTY_ID}` && request.method === 'GET' && request.headers.authorization === undefined) {
          return json(response, 200, { id: PROPERTY_ID, status: 'PUBLISHED' });
        }
        if (url.startsWith('/properties') && request.method === 'POST') return json(response, 201, { id: PROPERTY_ID, status: 'DRAFT' });
        if (url.startsWith('/properties') && request.method === 'PUT') return json(response, 409, { code: 'VERSION_CONFLICT' });
        if (url.startsWith('/properties')) return json(response, 200, { id: PROPERTY_ID, status: 'DRAFT', ownerId: USER_ID });
        return json(response, 404, { code: 'NOT_FOUND' });
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const address = stub.address();
    if (address === null || typeof address === 'string') throw new Error('stub not listening');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    fixture = createTestGatewayConfig({
      GATEWAY_AUTH_BASE_URL: baseUrl,
      GATEWAY_ACCOMMODATIONS_BASE_URL: baseUrl,
      GATEWAY_SEARCH_BASE_URL: baseUrl,
    });
    process.env = { ...originalEnv, ...fixture.env };
    const kid = Object.keys(fixture.config.userJwt.publicKeys)[0] ?? '';
    ownerBearer = await mintBearer(fixture, kid, 'OWNER');
    guestBearer = await mintBearer(fixture, kid, 'GUEST');
    app = await startGateway(fixture.config);
  }, 30000);

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    process.env = originalEnv;
  });

  beforeEach(() => { calls.length = 0; role = 'OWNER'; });

  it('GET /properties/:id anónimo llega a Accommodations sin Authorization', async () => {
    const reply = await call('GET', `/api/v1/properties/${PROPERTY_ID}`);
    expect(reply.status).toBe(200);
    expect(calls[0]?.url).toBe(`/properties/${PROPERTY_ID}`);
    expect(calls[0]?.authorization).toBeUndefined();
  });

  it('GET /properties/:id con bearer lo valida y lo reenvía', async () => {
    const reply = await call('GET', `/api/v1/properties/${PROPERTY_ID}`, ownerBearer);
    expect(reply.status).toBe(200);
    expect(reply.body.ownerId).toBe(USER_ID);
    expect(calls[0]?.authorization).toBe(`Bearer ${ownerBearer}`);
  });

  it('GET /properties/:id con bearer inválido responde 401 sin contactar Accommodations', async () => {
    const reply = await call('GET', `/api/v1/properties/${PROPERTY_ID}`, 'not-a-jwt');
    expect(reply.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('rechaza un id que no es UUID con 400', async () => {
    const reply = await call('GET', '/api/v1/properties/abc');
    expect(reply.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('POST /properties reenvía el cuerpo JSON del OWNER y responde 201', async () => {
    const payload = { type: 'APARTMENT', name: 'Casa' };
    const reply = await call('POST', '/api/v1/properties', ownerBearer, JSON.stringify(payload), 'application/json');
    expect(reply.status).toBe(201);
    expect(calls[0]?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.body.toString('utf8') ?? '{}')).toEqual(payload);
  });

  it('POST /properties con rol GUEST responde 403 sin contactar Accommodations', async () => {
    role = 'GUEST';
    const reply = await call('POST', '/api/v1/properties', guestBearer, '{}', 'application/json');
    expect(reply.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('PUT /properties/:id conserva el 409 remoto como Problem Details', async () => {
    const reply = await call('PUT', `/api/v1/properties/${PROPERTY_ID}`, ownerBearer, '{"version":1}', 'application/json');
    expect(reply.status).toBe(409);
    expect(reply.contentType).toContain('application/problem+json');
    expect(reply.body.code).toBe('VERSION_CONFLICT');
  });

  it('POST /properties/:id/photos reenvía la foto como multipart "file"', async () => {
    const boundary = 'testboundary';
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const reply = await call('POST', `/api/v1/properties/${PROPERTY_ID}/photos`, ownerBearer, body, `multipart/form-data; boundary=${boundary}`);
    expect(reply.status).toBe(201);
    expect(calls[0]?.contentType).toMatch(/^multipart\/form-data; boundary=/u);
    expect(calls[0]?.body.includes(png)).toBe(true);
    expect(calls[0]?.body.toString('latin1')).toContain('name="file"');
  });

  it('GET /search es pública, usa service JWT de Search y conserva amenities repetidas', async () => {
    const reply = await call('GET', '/api/v1/search?q=playa&amenities=wifi&amenities=pool');
    expect(reply.status).toBe(200);
    expect(calls[0]?.url).toBe('/internal/v1/search?q=playa&amenities=wifi&amenities=pool');
    const key = await importSPKI(fixture.servicePublicKeyPem, 'RS256');
    const token = calls[0]?.authorization?.replace(/^Bearer /u, '') ?? '';
    const verified = await jwtVerify(token, key, { issuer: 'stayhub-api-gateway', audience: 'stayhub-search-service' });
    expect(verified.payload.scope).toBe('search:invoke');
  });

  it('GET /search/suggest reenvía q y limit', async () => {
    const reply = await call('GET', '/api/v1/search/suggest?q=bog&limit=5');
    expect(reply.status).toBe(200);
    expect(calls[0]?.url).toBe('/internal/v1/search/suggest?q=bog&limit=5');
  });

  it('GET /search rechaza parámetros desconocidos sin contactar Search', async () => {
    const reply = await call('GET', '/api/v1/search?ownerId=x');
    expect(reply.status).toBe(400);
    expect(reply.body.code).toBe('UNKNOWN_QUERY_PARAMETER');
    expect(calls).toHaveLength(0);
  });

  function call(method: string, path: string, token?: string, raw?: string | Buffer, contentType?: string): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (token !== undefined) headers.authorization = `Bearer ${token}`;
      if (raw !== undefined) {
        headers['content-type'] = contentType ?? 'application/json';
        headers['content-length'] = String(Buffer.byteLength(raw));
      }
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
  response.writeHead(status, { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' });
  response.end(JSON.stringify(body));
}

async function mintBearer(fixture: ReturnType<typeof createTestGatewayConfig>, kid: string, role: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role, sid: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setSubject(USER_ID).setIssuer(fixture.config.userJwt.issuer).setAudience(fixture.config.userJwt.audience)
    .setIssuedAt(now).setExpirationTime(now + 3600).setJti(randomUUID())
    .sign(await importPKCS8(fixture.servicePrivateKeyPem, 'RS256'));
}
