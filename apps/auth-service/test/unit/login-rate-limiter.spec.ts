import type { AuthCache, LoginFailureWindow } from '@auth/application/ports/cache.port';
import { DependencyUnavailableError, LoginRateLimitError } from '@auth/application/errors/auth-errors';
import { LoginRateLimiterService } from '@auth/application/login/login-rate-limiter';

const SECRET = 'unit-login-identifier-hmac-secret-0123456789';
const EMAIL = 'jane.doe@example.test';

class FakeAuthCache implements AuthCache {
  public count = 0;
  public ttlSeconds = 900;
  public failureMode: 'none' | 'read' | 'record' | 'clear' = 'none';
  public readonly readHashes: string[] = [];
  public readonly recordHashes: string[] = [];
  public readonly clearHashes: string[] = [];
  public readonly recordWindows: number[] = [];

  public readLoginFailures(identifierHash: string): Promise<LoginFailureWindow> {
    this.readHashes.push(identifierHash);
    if (this.failureMode === 'read') throw new DependencyUnavailableError('redis');
    return Promise.resolve({ count: this.count, ttlSeconds: this.ttlSeconds });
  }

  public recordLoginFailure(
    identifierHash: string,
    windowSeconds: number,
  ): Promise<LoginFailureWindow> {
    this.recordHashes.push(identifierHash);
    this.recordWindows.push(windowSeconds);
    if (this.failureMode === 'record') throw new DependencyUnavailableError('redis');
    this.count += 1;
    return Promise.resolve({ count: this.count, ttlSeconds: this.ttlSeconds });
  }

  public clearLoginFailures(identifierHash: string): Promise<void> {
    this.clearHashes.push(identifierHash);
    if (this.failureMode === 'clear') throw new DependencyUnavailableError('redis');
    this.count = 0;
    return Promise.resolve();
  }

  public getSession<T>(): Promise<T | null> {
    return Promise.reject(new Error('not implemented'));
  }

  public setSession(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  public deleteSession(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  public ping(): Promise<boolean> {
    return Promise.reject(new Error('not implemented'));
  }
}

function build(options: { readonly cache?: FakeAuthCache } = {}): {
  readonly cache: FakeAuthCache;
  readonly limiter: LoginRateLimiterService;
} {
  const cache = options.cache ?? new FakeAuthCache();
  const limiter = new LoginRateLimiterService({ cache, identifierSecret: SECRET });
  return { cache, limiter };
}

describe('LoginRateLimiterService (AUTH-064)', () => {
  it('rejects a secret shorter than 32 characters', () => {
    const cache = new FakeAuthCache();
    expect(() => new LoginRateLimiterService({ cache, identifierSecret: 'too-short' })).toThrow();
  });

  it('hashes the normalized email to 64 hex chars and never passes the raw email', async (): Promise<void> => {
    const { cache, limiter } = build();

    await limiter.inspect(EMAIL);

    expect(cache.readHashes).toHaveLength(1);
    const [hash] = cache.readHashes;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('jane');
    expect(hash).not.toContain('@');
  });

  it('shares the hash across case and whitespace variants', async (): Promise<void> => {
    const { cache, limiter } = build();

    await limiter.inspect(EMAIL);
    await limiter.inspect('  Jane.Doe@Example.TEST  ');

    expect(cache.readHashes[0]).toBe(cache.readHashes[1]);
  });

  it('does not block the first five failures and blocks the sixth via inspect', async (): Promise<void> => {
    const { cache, limiter } = build();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(limiter.inspect(EMAIL)).resolves.toBeUndefined();
      await expect(limiter.recordFailure(EMAIL)).resolves.toBeUndefined();
    }
    expect(cache.count).toBe(5);

    await limiter.recordFailure(EMAIL).catch(() => undefined);
    expect(cache.count).toBe(6);

    const error = await limiter.inspect(EMAIL).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LoginRateLimitError);
    if (error instanceof LoginRateLimitError) expect(error.retryAfterSeconds).toBe(cache.ttlSeconds);
  });

  it('throws a rate limit error on the sixth recorded failure', async (): Promise<void> => {
    const { cache, limiter } = build();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.recordFailure(EMAIL);
    }

    const error = await limiter.recordFailure(EMAIL).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LoginRateLimitError);
    expect(cache.recordWindows).toEqual([900, 900, 900, 900, 900, 900]);
  });

  it('never returns a Retry-After below one even without a TTL', async (): Promise<void> => {
    const cache = new FakeAuthCache();
    cache.count = 6;
    cache.ttlSeconds = 0;
    const limiter = new LoginRateLimiterService({ cache, identifierSecret: SECRET });

    const error = await limiter.inspect(EMAIL).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LoginRateLimitError);
    if (error instanceof LoginRateLimitError) expect(error.retryAfterSeconds).toBe(1);
  });

  it('clears the hashed counter on success', async (): Promise<void> => {
    const { cache, limiter } = build();
    cache.count = 3;

    await limiter.clear(EMAIL);

    expect(cache.clearHashes).toHaveLength(1);
    expect(cache.clearHashes[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(cache.count).toBe(0);
  });

  it.each(['read', 'record', 'clear'] as const)(
    'fails closed when the cache %s call fails',
    async (mode) => {
      const cache = new FakeAuthCache();
      cache.failureMode = mode;
      const limiter = new LoginRateLimiterService({ cache, identifierSecret: SECRET });

      const operation =
        mode === 'read'
          ? limiter.inspect(EMAIL)
          : mode === 'record'
            ? limiter.recordFailure(EMAIL)
            : limiter.clear(EMAIL);

      await expect(operation).rejects.toBeInstanceOf(DependencyUnavailableError);
    },
  );

  it('wraps unexpected cache errors as dependency errors', async (): Promise<void> => {
    const cache = new FakeAuthCache();
    cache.readLoginFailures = (): Promise<LoginFailureWindow> => Promise.reject(new Error('boom'));
    const limiter = new LoginRateLimiterService({ cache, identifierSecret: SECRET });

    await expect(limiter.inspect(EMAIL)).rejects.toBeInstanceOf(DependencyUnavailableError);
  });
});
