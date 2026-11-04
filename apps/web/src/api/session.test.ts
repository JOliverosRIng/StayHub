import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from './session';
const pair = { accessToken: 'access', tokenType: 'Bearer', expiresIn: 3600, user: { userId: 'u1', sessionId: 's1', role: 'GUEST' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, work: () => Promise<unknown>) => work() } });
  vi.stubGlobal('BroadcastChannel', undefined);
  fetcher = vi.fn((url: string) => Promise.resolve(json(url.endsWith('/refresh') || url.endsWith('/login') ? pair : url.endsWith('/validate') ? pair.user : { name: 'Ana', email: 'ana@example.test' })));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('session lifecycle', () => {
  it('deduplicates initialization, retires mock identity and loads real profile', async () => {
    localStorage.setItem('stayhub_users', 'mock'); localStorage.setItem('stayhub_bookings', 'keep');
    const store = new SessionStore();
    await Promise.all([store.initialize(), store.initialize()]);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
    expect(store.snapshot()).toMatchObject({ status: 'authenticated', currentUser: { id: 'u1', name: 'Ana' } });
    expect(localStorage.getItem('stayhub_users')).toBeNull(); expect(localStorage.getItem('stayhub_bookings')).toBe('keep');
  });
  it('distinguishes missing session from unavailable service', async () => {
    fetcher.mockResolvedValueOnce(json({}, 401)); const missing = new SessionStore(); await missing.initialize(); expect(missing.snapshot().status).toBe('anonymous');
    fetcher.mockResolvedValueOnce(json({}, 503)); const offline = new SessionStore(); await offline.initialize(); expect(offline.snapshot().status).toBe('unavailable');
    await offline.restore(); expect(offline.snapshot().status).toBe('authenticated');
  });
  it('keeps generic identity when profile is unavailable', async () => {
    fetcher.mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/refresh') ? pair : url.endsWith('/validate') ? pair.user : {}, url.includes('/users/') ? 503 : 200)));
    const store = new SessionStore(); await store.initialize(); expect(store.snapshot()).toMatchObject({ status: 'authenticated', profileUnavailable: true, currentUser: { name: 'Mi cuenta' } });
  });
  it('renews before expiry', async () => {
    const store = new SessionStore(); await store.initialize(); await vi.advanceTimersByTimeAsync(3540000);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(2);
  });
  it('deduplicates refresh after protected 401 and repeats each operation once', async () => {
    const store = new SessionStore(); await store.initialize(); let failures = 2;
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((url: string) => url.endsWith('/protected') ? Promise.resolve(json({}, failures-- > 0 ? 401 : 200)) : original(url));
    await Promise.all([store.authorized('/protected'), store.authorized('/protected')]);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/protected'))).toHaveLength(4);
  });
  it('keeps the session when a retried resource is unavailable, and retries only once', async () => {
    const store = new SessionStore(); await store.initialize();
    const original = fetcher.getMockImplementation()!; let attempts = 0;
    fetcher.mockImplementation((url: string) => url.endsWith('/protected') ? Promise.resolve(json({}, ++attempts === 1 ? 401 : 503)) : original(url));
    await expect(store.authorized('/protected')).rejects.toMatchObject({ status: 503 });
    expect(store.snapshot().status).toBe('authenticated'); expect(attempts).toBe(2);
  });
  it('clears an invalid session when refresh fails with 401', async () => {
    const store = new SessionStore(); await store.initialize();
    fetcher.mockResolvedValue(json({}, 401));
    await expect(store.authorized('/protected')).rejects.toMatchObject({ status: 401 });
    expect(store.snapshot().status).toBe('anonymous');
  });
  it('discards login response after logout and completes cookie removal', async () => {
    const store = new SessionStore(); let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const login = store.login('a@example.test', 'password');
    await Promise.resolve(); const logout = store.logout(); finish(json(pair));
    await expect(login).rejects.toMatchObject({ status: 401 }); await logout;
    expect(store.snapshot().currentUser).toBeNull();
  });
});

describe('cross-tab coordination', () => {
  it('serializes refresh, shares the result and clears every tab on logout', async () => {
    type Message = { type: string };
    const peers: Channel[] = [];
    class Channel {
      onmessage?: (event: { data: Message }) => void;
      constructor() { peers.push(this); }
      postMessage(data: Message) { for (const peer of peers) if (peer !== this) peer.onmessage?.({ data }); }
    }
    localStorage.removeItem('stayhub_auth_epoch');
    vi.stubGlobal('BroadcastChannel', Channel);
    let queue: Promise<unknown> = Promise.resolve();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: (_name: string, work: () => Promise<unknown>) => { const result = queue.then(work); queue = result.catch(() => undefined); return result; },
    } });
    const first = new SessionStore(); const second = new SessionStore();
    await Promise.all([first.initialize(), second.initialize()]);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
    expect(first.snapshot().status).toBe('authenticated'); expect(second.snapshot().status).toBe('authenticated');
    await first.logout(); expect(first.snapshot().currentUser).toBeNull(); expect(second.snapshot().currentUser).toBeNull();
  });
  it('fails explicitly when secure browser coordination is unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const store = new SessionStore(); await store.initialize(); expect(store.snapshot().status).toBe('unavailable'); expect(fetcher).not.toHaveBeenCalled();
  });
});
