import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { ApiError } from './identity';
import { createHttpClient, parseRetryAfter, resolveBaseUrl, type BearerSource } from './http';
import { createQueryClient, shouldRetry } from './queryClient';

function source(initial?: string, renewed = 'fresh'): BearerSource & { token?: string } {
  const state: BearerSource & { token?: string } = {
    token: initial,
    accessToken: () => state.token,
    recoverFromUnauthorized: vi.fn(async () => { state.token = renewed; return renewed; }),
    expire: vi.fn(() => { state.token = undefined; }),
  };
  return state;
}

function protectedRoute(accepts: (bearer: string | null) => boolean) {
  const seen: (string | null)[] = [];
  server.use(mock.get('*/api/v1/protected', ({ request }) => {
    const bearer = request.headers.get('Authorization');
    seen.push(bearer);
    return accepts(bearer) ? HttpResponse.json({ ok: true }) : HttpResponse.json({ code: 'HTTP_401' }, { status: 401 });
  }));
  return seen;
}

describe('Gateway HTTP client', () => {
  it('uses the Gateway base path and injects the session bearer', async () => {
    const seen = protectedRoute(() => true);
    const client = createHttpClient(source('access'));
    await expect(client.get('/protected')).resolves.toMatchObject({ data: { ok: true } });
    expect(seen).toEqual(['Bearer access']);
  });

  it('sends anonymous requests without Authorization', async () => {
    const seen = protectedRoute(() => true);
    await createHttpClient(source()).get('/protected');
    expect(seen).toEqual([null]);
  });

  it('refreshes once after 401 and retries with the renewed bearer', async () => {
    const bearer = source('stale');
    const seen = protectedRoute((value) => value === 'Bearer fresh');
    await expect(createHttpClient(bearer).get('/protected')).resolves.toMatchObject({ status: 200 });
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
    expect(bearer.recoverFromUnauthorized).toHaveBeenCalledTimes(1);
    expect(bearer.expire).not.toHaveBeenCalled();
  });

  it('expires the session when the retried request is still unauthorized', async () => {
    const bearer = source('stale');
    const seen = protectedRoute(() => false);
    await expect(createHttpClient(bearer).get('/protected')).rejects.toMatchObject({ status: 401 });
    expect(seen).toHaveLength(2);
    expect(bearer.expire).toHaveBeenCalledTimes(1);
  });

  it('propagates refresh failure without retrying the request', async () => {
    const bearer = source('stale');
    vi.mocked(bearer.recoverFromUnauthorized).mockRejectedValueOnce(new ApiError(401));
    const seen = protectedRoute(() => false);
    await expect(createHttpClient(bearer).get('/protected')).rejects.toMatchObject({ status: 401 });
    expect(seen).toHaveLength(1);
  });

  it('does not refresh anonymous 401 responses', async () => {
    const bearer = source();
    protectedRoute(() => false);
    await expect(createHttpClient(bearer).get('/protected')).rejects.toBeInstanceOf(ApiError);
    expect(bearer.recoverFromUnauthorized).not.toHaveBeenCalled();
  });

  it('maps Problem Details and Retry-After without exposing detail text', async () => {
    server.use(mock.get('*/api/v1/limited', () => HttpResponse.json(
      { code: 'RATE_LIMITED', detail: 'internal', traceId: 't-1' }, { status: 429, headers: { 'Retry-After': '30' } })));
    const error = await createHttpClient(source()).get('/limited').catch((e: unknown) => e) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, retryAfter: 30, problem: { code: 'RATE_LIMITED', traceId: 't-1' } });
    expect(error.message).not.toContain('internal');
  });

  it('maps network failures to status 0', async () => {
    server.use(mock.get('*/api/v1/down', () => HttpResponse.error()));
    await expect(createHttpClient(source()).get('/down')).rejects.toMatchObject({ status: 0 });
  });
});

describe('HTTP configuration helpers', () => {
  it.each([[undefined, '/api/v1'], ['  ', '/api/v1'], ['https://api.example/api/v1/', 'https://api.example/api/v1']])('resolves base URL %j', (raw, expected) => {
    expect(resolveBaseUrl(raw)).toBe(expected);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter(new Date(1_000_000 + 5_000).toUTCString(), 1_000_000)).toBe(5);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('retries only transient failures', () => {
    expect(shouldRetry(0, new ApiError(503))).toBe(true);
    expect(shouldRetry(0, new ApiError(0))).toBe(true);
    expect(shouldRetry(2, new ApiError(503))).toBe(false);
    expect(shouldRetry(0, new ApiError(404))).toBe(false);
    expect(shouldRetry(0, new ApiError(429))).toBe(false);
    expect(shouldRetry(0, new Error('x'))).toBe(false);
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
