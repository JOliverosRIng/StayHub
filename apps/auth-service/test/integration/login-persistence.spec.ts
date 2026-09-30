import { randomUUID } from 'node:crypto';

import { DependencyUnavailableError, InvalidCredentialsError } from '@auth/application/errors/auth-errors';
import { LoginRateLimiterService } from '@auth/application/login/login-rate-limiter';
import { LoginService } from '@auth/application/login/login.use-case';
import { IssueSessionTokensService } from '@auth/application/sessions/issue-session-tokens.service';
import { Credential } from '@auth/domain/credentials/credential';
import { AuthCacheAdapter } from '@auth/infrastructure/cache/auth-cache.adapter';
import { UsersLoginIdentityClient } from '@auth/infrastructure/http/users-login-identity.client';
import { UsersServiceClient } from '@auth/infrastructure/http/users-service.client';
import { PrismaCredentialRepository } from '@auth/infrastructure/persistence/prisma/credential.repository';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { PrismaSessionUnitOfWork } from '@auth/infrastructure/persistence/prisma/session-unit-of-work';
import { Argon2PasswordHasher } from '@auth/infrastructure/security/argon2-password-hasher';
import { HmacRefreshTokenCodec } from '@auth/infrastructure/security/hmac-refresh-token.codec';
import { Rs256TokenService } from '@auth/infrastructure/security/rs256-token.service';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import { createAuthCryptoFixture } from '../helpers/crypto-fixture';
import { FakeClock } from '../helpers/fake-clock';
import { UsersStub } from '../helpers/users-stub';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const PASSWORD = 'Correct-Horse-Battery-Staple-42';
const EMAIL = 'jane.doe@example.test';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('login persistence over PostgreSQL and Redis (AUTH-065)', () => {
  let dependencies: IntegrationDependencies;
  let stub: UsersStub;
  let primary: PrismaService;
  let cache: AuthCacheAdapter;
  let clock: FakeClock;
  let codec: HmacRefreshTokenCodec;
  let signer: Rs256TokenService;
  let credentials: PrismaCredentialRepository;
  let unitOfWork: PrismaSessionUnitOfWork;
  let hasher: Argon2PasswordHasher;
  let rateLimiter: LoginRateLimiterService;
  let users: UsersLoginIdentityClient;
  let service: LoginService;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    stub = new UsersStub({
      requireServiceAuthorization: true,
      verifyServiceToken: (token: string): Promise<boolean> =>
        Promise.resolve(token.split('.').length === 3),
    });
    const usersUrl = await stub.start();
    const config = createAuthCryptoFixture({
      databaseUrl: process.env.TEST_AUTH_DATABASE_URL as string,
      redisUrl: process.env.TEST_AUTH_REDIS_URL as string,
      usersServiceUrl: usersUrl,
      usersTimeoutMs: 2_000,
      usersCircuitFailureThreshold: 100,
    }).config;

    primary = new PrismaService({
      datasources: { db: { url: process.env.TEST_AUTH_DATABASE_URL as string } },
    });
    await primary.$connect();

    cache = new AuthCacheAdapter(config, dependencies.redis);
    clock = new FakeClock(NOW);
    codec = new HmacRefreshTokenCodec(config);
    signer = new Rs256TokenService(config, clock);
    const issuer = new IssueSessionTokensService({
      codec,
      signer,
      uuid: { generate: randomUUID },
      clock,
    });
    credentials = new PrismaCredentialRepository(primary);
    unitOfWork = new PrismaSessionUnitOfWork(primary);
    hasher = new Argon2PasswordHasher(config);
    rateLimiter = new LoginRateLimiterService({ cache, identifierSecret: config.loginIdentifierHmacSecret });
    const tokenProvider = new UsersServiceTokenProvider(config, clock, { generate: randomUUID });
    users = new UsersLoginIdentityClient(new UsersServiceClient(config, tokenProvider));

    service = new LoginService({ users, credentials, hasher, rateLimiter, unitOfWork, issuer });
  });

  afterAll(async () => {
    await cache.onModuleDestroy();
    await primary.$disconnect();
    await stub.stop();
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
    stub.reset();
    jest.restoreAllMocks();
  });

  function seedActiveUser(role: 'GUEST' | 'OWNER' | 'ADMIN', email: string = EMAIL): string {
    const userId = randomUUID();
    stub.seed({
      registrationId: randomUUID(),
      userId,
      name: 'Jane Guest',
      email,
      role,
      status: 'ACTIVE',
    });
    return userId;
  }

  async function seedActiveCredential(userId: string, password: string = PASSWORD): Promise<void> {
    const credential = Credential.create(userId, await hasher.hash(password), NOW);
    credential.activate(NOW);
    await credentials.save(credential);
  }

  async function failureKeys(): Promise<readonly string[]> {
    return dependencies.redis.keys('auth:login-failures:*');
  }

  it.each(['GUEST', 'OWNER', 'ADMIN'] as const)(
    'authenticates an ACTIVE %s and persists session + refresh atomically',
    async (role): Promise<void> => {
      const userId = seedActiveUser(role);
      await seedActiveCredential(userId);

      const result = await service.execute({ email: EMAIL, password: PASSWORD, traceId: `trace-${role}` });

      expect(result.expiresIn).toBe(3600);
      expect(result.principal).toMatchObject({ userId, role });
      expect(result.principal.sessionId).toMatch(UUID_PATTERN);
      expect(result.absoluteExpiresAt).toEqual(new Date(NOW.getTime() + 604_800_000));

      const sessions = await primary.session.findMany();
      const refreshTokens = await primary.refreshToken.findMany();
      expect(sessions).toHaveLength(1);
      expect(refreshTokens).toHaveLength(1);
      expect(sessions[0]?.id).toBe(result.principal.sessionId);
      expect(sessions[0]?.role).toBe(role);
      expect(refreshTokens[0]?.sessionId).toBe(result.principal.sessionId);
      expect(refreshTokens[0]?.status).toBe('ACTIVE');
      expect(refreshTokens[0]?.tokenHash).toBe(codec.hash(result.refreshToken));
      expect(refreshTokens[0]?.tokenHash).not.toBe(result.refreshToken);
      expect(JSON.stringify(refreshTokens[0])).not.toContain(result.refreshToken);

      const claims = await signer.verifyAccessToken(result.accessToken);
      expect(claims).toMatchObject({ sub: userId, sid: result.principal.sessionId, role });
      expect(claims.exp - claims.iat).toBe(3600);

      expect(await failureKeys()).toHaveLength(0);
    },
  );

  it('rejects a missing credential with the generic 401, no state and one counted failure', async (): Promise<void> => {
    seedActiveUser('GUEST');

    const error = await captureRejection(
      service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-missing-credential' }),
    );

    expect(error).toBeInstanceOf(InvalidCredentialsError);
    expect(await primary.session.count()).toBe(0);
    expect(await primary.refreshToken.count()).toBe(0);
    expect(await failureKeys()).toHaveLength(1);
  });

  it('rejects a wrong password without creating a session', async (): Promise<void> => {
    const userId = seedActiveUser('OWNER');
    await seedActiveCredential(userId, 'a-different-password');

    const error = await captureRejection(
      service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-wrong-password' }),
    );

    expect(error).toBeInstanceOf(InvalidCredentialsError);
    expect(await primary.session.count()).toBe(0);
    expect(await primary.refreshToken.count()).toBe(0);
    expect(await failureKeys()).toHaveLength(1);
  });

  it('rolls back and fails closed when clearing the failure counter fails', async (): Promise<void> => {
    const userId = seedActiveUser('GUEST');
    await seedActiveCredential(userId);
    const failingService = new LoginService({
      users,
      credentials,
      hasher,
      rateLimiter: {
        inspect: (email): Promise<void> => rateLimiter.inspect(email),
        recordFailure: (email): Promise<void> => rateLimiter.recordFailure(email),
        clear: (): Promise<void> => Promise.reject(new DependencyUnavailableError('redis')),
      },
      unitOfWork,
      issuer: new IssueSessionTokensService({ codec, signer, uuid: { generate: randomUUID }, clock }),
    });

    const error = await captureRejection(
      failingService.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-clear-down' }),
    );

    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect(await primary.session.count()).toBe(0);
    expect(await primary.refreshToken.count()).toBe(0);
  });

  it('propagates a technical persistence failure without returning tokens', async (): Promise<void> => {
    const userId = seedActiveUser('GUEST');
    await seedActiveCredential(userId);
    jest
      .spyOn(unitOfWork, 'execute')
      .mockRejectedValueOnce(new DependencyUnavailableError('database'));

    const error = await captureRejection(
      service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-uow-down' }),
    );

    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect(await primary.session.count()).toBe(0);
    expect(await primary.refreshToken.count()).toBe(0);
  });
});
