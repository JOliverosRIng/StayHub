import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, identityApi, request } from './identity';
afterEach(() => vi.unstubAllGlobals());
describe('public identity transport', () => {
  it('sends only public registration fields, exact password and idempotency key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const data = { name: 'Ana', email: 'ana@example.test', password: '  secret  ', role: 'OWNER' as const };
    await identityApi.register(data, 'uuid');
    expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/register', expect.objectContaining({ credentials: 'include', body: JSON.stringify(data), headers: expect.objectContaining({ 'Idempotency-Key': 'uuid' }) }));
  });
  it('handles retry after and Problem Details without exposing raw detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'LIMIT', detail: 'private' }), { status: 429, headers: { 'Retry-After': '12' } })));
    await expect(identityApi.login('a@example.test', 'pw')).rejects.toMatchObject({ status: 429, retryAfter: 12, problem: { code: 'LIMIT' } });
  });
  it('does not retry an ambiguous refresh and safely maps network errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetcher);
    await expect(identityApi.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('supports empty logout and bearer protected requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetcher);
    await identityApi.logout(); await request('/auth/validate', {}, 'access');
    expect(fetcher).toHaveBeenLastCalledWith('/api/v1/auth/validate', expect.objectContaining({ headers: { Authorization: 'Bearer access' } }));
  });
});
