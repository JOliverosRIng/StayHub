import { createHmac, randomUUID } from 'node:crypto';
import Redis from 'ioredis';

import {
  DependencyUnavailableError,
  InvalidCredentialsError,
  LoginRateLimitError,
} from '@auth/application/errors/auth-errors';
import type { LoginFailureWindow } from '@auth/application/ports/cache.port';
import type { LoginIdentity } from '@auth/application/ports/users-service.port';
import { LoginRateLimiterService } from '@auth/application/login/login-rate-limiter';
import { LoginService } from '@auth/application/login/login.use-case';
import { Credential } from '@auth/domain/credentials/credential';
import { AuthCacheAdapter } from '@auth/infrastructure/cache/auth-cache.adapter';
import { createAuthCryptoFixture } from '../helpers/crypto-fixture';
import {
  FakeCredentialRepository,
  FakePasswordHasher,
  FakeSessionTokensIssuer,
  FakeSessionUnitOfWork,
  LOGIN_TEST_NOW,
  type LoginRateLimiter,
} from '../helpers/reference-login';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const SECRET = 'test-login-identifier-hmac-secret-0123456789';
const PASSWORD = 'Correct-Horse-Battery-Staple-42';
const EMAIL = 'jane.doe@example.test';

interface LoginCommandInput {
  readonly email: string;
  readonly password: string;
  readonly traceId: string;
}

function command(traceId: string, email: string = EMAIL): LoginCommandInput {
  return { email, password: PASSWORD, traceId };
}

function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

interface LoginHarness {
  readonly service: LoginService;
  readonly users: {
    resolveLoginIdentity: jest.Mock<Promise<LoginIdentity | null>, [string, string]>;
  };
  readonly credentials: FakeCredentialRepository;
  readonly hasher: FakePasswordHasher;
  readonly unitOfWork: FakeSessionUnitOfWork;
  readonly issuer: FakeSessionTokensIssuer;
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

describe('login rate limit over Redis (AUTH-056 re-run against the productive limiter)', () => {
  let dependencies: IntegrationDependencies;
  let cache: AuthCacheAdapter;
  let limiter: LoginRateLimiterService;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    const config = createAuthCryptoFixture({
      redisUrl: process.env.TEST_AUTH_REDIS_URL as string,
    }).config;
    cache = new AuthCacheAdapter(config, dependencies.redis);
    limiter = new LoginRateLimiterService({ cache, identifierSecret: SECRET });
  });

  afterAll(async () => {
    await cache.onModuleDestroy();
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
  });

  function identifierHash(email: string): string {
    return createHmac('sha256', SECRET).update(email.trim().toLowerCase()).digest('hex');
  }

  function keyFor(email: string): string {
    return `auth:login-failures:${identifierHash(email)}`;
  }

  function readFailures(email: string = EMAIL): Promise<LoginFailureWindow> {
    return cache.readLoginFailures(identifierHash(email));
  }

  function buildLogin(rateLimiter: LoginRateLimiter): LoginHarness {
    const users = {
      resolveLoginIdentity: jest.fn<Promise<LoginIdentity | null>, [string, string]>(() =>
        Promise.resolve(null),
      ),
    };
    const credentials = new FakeCredentialRepository();
    const hasher = new FakePasswordHasher();
    const unitOfWork = new FakeSessionUnitOfWork();
    const issuer = new FakeSessionTokensIssuer();
    const service = new LoginService({
      users,
      credentials,
      hasher,
      rateLimiter,
      unitOfWork,
      issuer,
    });
    return { service, users, credentials, hasher, unitOfWork, issuer };
  }

  function activeCredential(userId: string): Credential {
    const credential = Credential.create(userId, 'stored-hash', LOGIN_TEST_NOW);
    credential.activate(LOGIN_TEST_NOW);
    return credential;
  }

  it('stores only the HMAC identifier and never the raw email', async (): Promise<void> => {
    await limiter.recordFailure(EMAIL);

    const keys = await dependencies.redis.keys('auth:login-failures:*');
    expect(keys).toEqual([keyFor(EMAIL)]);
    expect(keyFor(EMAIL)).toMatch(/^auth:login-failures:[a-f0-9]{64}$/);
    expect(keys.join(',')).not.toContain('jane');
    expect(keys.join(',')).not.toContain('@');
  });

  it('returns 401 for the first five failures and 429 on the sixth with a bounded Retry-After', async (): Promise<void> => {
    const harness = buildLogin(limiter);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(harness.service.execute(command(`trace-${attempt}`))).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    }

    const error = await captureRejection(harness.service.execute(command('trace-6')));
    expect(error).toBeInstanceOf(LoginRateLimitError);
    if (error instanceof LoginRateLimitError) {
      expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(error.retryAfterSeconds).toBeLessThanOrEqual(900);
    }
  });

  it('does not extend the fixed window on additional blocked attempts', async (): Promise<void> => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await captureRejection(limiter.recordFailure(EMAIL));
    }
    const before = await readFailures();

    await sleep(80);
    const harness = buildLogin(limiter);
    await captureRejection(harness.service.execute(command('blocked')));

    const after = await readFailures();
    expect(after.count).toBe(6);
    expect(after.ttlSeconds).toBeLessThanOrEqual(before.ttlSeconds);
  });

  it('shares one counter across case and whitespace variants of the email', async (): Promise<void> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await captureRejection(limiter.recordFailure(EMAIL));
    }

    const harness = buildLogin(limiter);
    const error = await captureRejection(
      harness.service.execute(command('variant', '  Jane.Doe@Example.TEST  ')),
    );

    expect(error).toBeInstanceOf(LoginRateLimitError);
    expect((await readFailures()).count).toBe(6);
  });

  it('clears the counter on a successful login so the next failure is a 401', async (): Promise<void> => {
    const harness = buildLogin(limiter);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await captureRejection(limiter.recordFailure(EMAIL));
    }

    const userId = randomUUID();
    harness.users.resolveLoginIdentity.mockResolvedValue({ userId, role: 'GUEST', status: 'ACTIVE' });
    harness.credentials.findByUserId.mockResolvedValue(activeCredential(userId));
    harness.hasher.verifyWithEquivalentCost.mockResolvedValue(true);

    await harness.service.execute(command('success'));

    expect((await readFailures()).count).toBe(0);

    harness.users.resolveLoginIdentity.mockResolvedValue(null);
    harness.hasher.verifyWithEquivalentCost.mockResolvedValue(false);
    await expect(harness.service.execute(command('after-success'))).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('blocks even a valid login while the counter is at the limit', async (): Promise<void> => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await captureRejection(limiter.recordFailure(EMAIL));
    }
    const harness = buildLogin(limiter);
    const userId = randomUUID();
    harness.users.resolveLoginIdentity.mockResolvedValue({ userId, role: 'OWNER', status: 'ACTIVE' });
    harness.credentials.findByUserId.mockResolvedValue(activeCredential(userId));
    harness.hasher.verifyWithEquivalentCost.mockResolvedValue(true);

    const error = await captureRejection(harness.service.execute(command('blocked-valid')));

    expect(error).toBeInstanceOf(LoginRateLimitError);
    expect(harness.users.resolveLoginIdentity).not.toHaveBeenCalled();
    expect(harness.hasher.verifyWithEquivalentCost).not.toHaveBeenCalled();
  });

  it('starts a fresh window once the key expires', async (): Promise<void> => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await captureRejection(limiter.recordFailure(EMAIL));
    }
    await dependencies.redis.pexpire(keyFor(EMAIL), 40);
    await sleep(150);

    expect((await readFailures()).count).toBe(0);

    const harness = buildLogin(limiter);
    await expect(harness.service.execute(command('fresh-window'))).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('repairs a counter left without TTL instead of prolonging the window', async (): Promise<void> => {
    await limiter.recordFailure(EMAIL);
    await dependencies.redis.persist(keyFor(EMAIL));

    const repaired = await readFailures();

    expect(repaired.count).toBe(1);
    expect(repaired.ttlSeconds).toBeGreaterThan(0);
    expect(repaired.ttlSeconds).toBeLessThanOrEqual(900);
  });

  it('counts concurrent failures exactly with the atomic script', async (): Promise<void> => {
    const attempts = 12;

    await Promise.all(
      Array.from({ length: attempts }, () => captureRejection(limiter.recordFailure(EMAIL))),
    );

    const window = await readFailures();
    expect(window.count).toBe(attempts);
    expect(window.ttlSeconds).toBeGreaterThan(0);
  });

  describe('fail closed when Redis is unavailable', () => {
    function closedRedis(): Redis {
      return new Redis('redis://127.0.0.1:6399/15', {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null,
        connectTimeout: 300,
      });
    }

    it('rejects with a dependency error and does not create a session', async (): Promise<void> => {
      const client = closedRedis();
      try {
        const brokenCache = new AuthCacheAdapter(
          createAuthCryptoFixture({ redisUrl: 'redis://127.0.0.1:6399/15' }).config,
          client,
        );
        const brokenLimiter = new LoginRateLimiterService({
          cache: brokenCache,
          identifierSecret: SECRET,
        });
        const harness = buildLogin(brokenLimiter);

        const error = await captureRejection(harness.service.execute(command('redis-down')));

        expect(error).toBeInstanceOf(DependencyUnavailableError);
        expect(harness.unitOfWork.savedSessions).toHaveLength(0);
      } finally {
        client.disconnect();
      }
    });

    it('rolls back the session when clearing the counter fails', async (): Promise<void> => {
      const failingLimiter: LoginRateLimiter = {
        inspect: (email): Promise<void> => limiter.inspect(email),
        recordFailure: (email): Promise<void> => limiter.recordFailure(email),
        clear: (): Promise<void> => Promise.reject(new DependencyUnavailableError('redis')),
      };
      const harness = buildLogin(failingLimiter);
      const userId = randomUUID();
      harness.users.resolveLoginIdentity.mockResolvedValue({ userId, role: 'GUEST', status: 'ACTIVE' });
      harness.credentials.findByUserId.mockResolvedValue(activeCredential(userId));
      harness.hasher.verifyWithEquivalentCost.mockResolvedValue(true);

      const error = await captureRejection(harness.service.execute(command('clear-down')));

      expect(error).toBeInstanceOf(DependencyUnavailableError);
      expect(harness.unitOfWork.savedSessions).toHaveLength(0);
      expect(harness.unitOfWork.savedRefreshTokens).toHaveLength(0);
    });
  });
});
