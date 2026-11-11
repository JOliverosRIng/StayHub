import { BookingsClient } from '@gateway/infrastructure/http/bookings.client';
import { importSPKI, jwtVerify } from 'jose';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

describe('Gateway -> Bookings routing (T097)', () => {
  it('propagates user identity, trace and idempotency without exposing a service credential', async () => {
    const fixture = createTestGatewayConfig();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new BookingsClient(fixture.config, {
      fetch: ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        calls.push({ url, ...(init ? { init } : {}) });
        return Promise.resolve(new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000123' }), {
          status: 201, headers: { 'content-type': 'application/json' },
        }));
      }) as typeof fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    await client.request(
      { traceId: 'trace-bookings-1', userId: '00000000-0000-4000-8000-000000000999', role: 'GUEST' },
      'POST', '/bookings',
      { propertyId: '00000000-0000-4000-8000-000000000001' },
      'booking-key-000001',
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://bookings-service:3005/bookings');
    const headers = new Headers(calls[0]?.init?.headers);
    const authorization = headers.get('authorization');
    expect(authorization).toMatch(/^Bearer /u);
    const key = await importSPKI(fixture.servicePublicKeyPem, 'RS256');
    const verified = await jwtVerify(authorization!.slice(7), key, {
      issuer: fixture.config.serviceJwt.issuer,
      audience: fixture.config.bookingsServiceJwt.audience,
    });
    expect(verified.payload.sub).toBe('00000000-0000-4000-8000-000000000999');
    expect(verified.payload.role).toBe('GUEST');
    expect(verified.payload.scope).toBe('bookings:invoke');
    expect(headers.get('x-request-id')).toBe('trace-bookings-1');
    expect(headers.get('idempotency-key')).toBe('booking-key-000001');
  });

  it('routes lifecycle operations and preserves remote Problem Details status', async () => {
    const fixture = createTestGatewayConfig();
    const client = new BookingsClient(fixture.config, {
      fetch: ((): Promise<Response> => Promise.resolve(new Response(JSON.stringify({
        type: 'about:blank', title: 'Conflict', status: 409, detail: 'State conflict',
        instance: '/bookings/id/check-in', code: 'STATE_CONFLICT', traceId: 'trace-2', errors: [],
      }), { status: 409, headers: { 'content-type': 'application/problem+json' } }))) as typeof fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    await expect(client.request(
      { traceId: 'trace-2', userId: '00000000-0000-4000-8000-000000000998', role: 'OWNER' }, 'POST',
      '/bookings/00000000-0000-4000-8000-000000000123/check-in',
    )).rejects.toMatchObject({ status: 409 });
  });
});
