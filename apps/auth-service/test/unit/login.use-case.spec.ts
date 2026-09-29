import { randomUUID } from 'node:crypto';

import {
  DependencyUnavailableError,
  InvalidCredentialsError,
  LoginRateLimitError,
} from '@auth/application/errors/auth-errors';
import type { LoginIdentity } from '@auth/application/ports/users-service.port';
import { LoginService } from '@auth/application/login/login.use-case';
import { Credential, type CredentialStatus } from '@auth/domain/credentials/credential';
import {
  FakeCredentialRepository,
  FakeLoginRateLimiter,
  FakePasswordHasher,
  FakeSessionTokensIssuer,
  FakeSessionUnitOfWork,
  LOGIN_TEST_NOW,
} from '../helpers/reference-login';

const PASSWORD = 'Correct-Horse-Battery-Staple-42';
const EMAIL = 'jane.doe@example.test';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identity(role: 'GUEST' | 'OWNER' | 'ADMIN', userId: string): LoginIdentity {
  return { userId, role, status: 'ACTIVE' };
}

function credentialFor(userId: string, status: CredentialStatus, passwordHash = 'stored-hash'): Credential {
  const credential = Credential.create(userId, passwordHash, LOGIN_TEST_NOW);
  if (status === 'ACTIVE') credential.activate(LOGIN_TEST_NOW);
  if (status === 'REVOKED') credential.revoke(LOGIN_TEST_NOW);
  return credential;
}

interface Harness {
  readonly service: LoginService;
  readonly users: {
    resolveLoginIdentity: jest.Mock<Promise<LoginIdentity | null>, [string, string]>;
  };
  readonly credentials: FakeCredentialRepository;
  readonly hasher: FakePasswordHasher;
  readonly rateLimiter: FakeLoginRateLimiter;
  readonly unitOfWork: FakeSessionUnitOfWork;
  readonly issuer: FakeSessionTokensIssuer;
}

function createHarness(): Harness {
  const users = {
    resolveLoginIdentity: jest.fn<Promise<LoginIdentity | null>, [string, string]>(() =>
      Promise.resolve(null),
    ),
  };
  const credentials = new FakeCredentialRepository();
  const hasher = new FakePasswordHasher();
  const rateLimiter = new FakeLoginRateLimiter();
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
  return { service, users, credentials, hasher, rateLimiter, unitOfWork, issuer };
}

async function runNegative(mutate: (harness: Harness, userId: string) => void): Promise<Harness> {
  const harness = createHarness();
  const userId = randomUUID();
  harness.users.resolveLoginIdentity.mockResolvedValue(identity('GUEST', userId));
  harness.credentials.findByUserId.mockResolvedValue(credentialFor(userId, 'ACTIVE'));
  harness.hasher.verifyWithEquivalentCost.mockResolvedValue(false);
  mutate(harness, userId);

  await expect(
    harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-negative' }),
  ).rejects.toBeInstanceOf(InvalidCredentialsError);

  expect(harness.rateLimiter.recordFailure).toHaveBeenCalledWith(EMAIL);
  expect(harness.issuer.issueNewSession).not.toHaveBeenCalled();
  expect(harness.unitOfWork.savedSessions).toHaveLength(0);
  expect(harness.unitOfWork.savedRefreshTokens).toHaveLength(0);
  return harness;
}

function authenticate(
  harness: Harness,
  role: 'GUEST' | 'OWNER' | 'ADMIN' = 'GUEST',
): Promise<string> {
  const userId = randomUUID();
  harness.users.resolveLoginIdentity.mockResolvedValue(identity(role, userId));
  harness.credentials.findByUserId.mockResolvedValue(credentialFor(userId, 'ACTIVE'));
  harness.hasher.verifyWithEquivalentCost.mockResolvedValue(true);
  return Promise.resolve(userId);
}

describe('LoginUseCase unit branches (AUTH-052)', () => {
  it.each(['GUEST', 'OWNER', 'ADMIN'] as const)(
    'authenticates an ACTIVE identity and creates session+refresh for %s',
    async (role): Promise<void> => {
      const harness = createHarness();
      const userId = await authenticate(harness, role);

      const result = await harness.service.execute({
        email: EMAIL,
        password: PASSWORD,
        traceId: 'trace-success',
      });

      expect(result.expiresIn).toBe(3600);
      expect(result.accessToken).toBe('signed.access.token');
      expect(result.refreshToken).toBe('raw.refresh.token');
      expect(result.absoluteExpiresAt).toEqual(new Date(LOGIN_TEST_NOW.getTime() + 604800 * 1000));
      expect(result.principal).toEqual({
        userId,
        sessionId: expect.stringMatching(UUID_PATTERN) as unknown as string,
        role,
      });
      expect(harness.hasher.verifyWithEquivalentCost).toHaveBeenCalledWith('stored-hash', PASSWORD);
      expect(harness.issuer.issueNewSession).toHaveBeenCalledWith(userId, role);
      expect(harness.rateLimiter.clear).toHaveBeenCalledWith(EMAIL);
      expect(harness.unitOfWork.savedSessions).toHaveLength(1);
      expect(harness.unitOfWork.savedRefreshTokens).toHaveLength(1);
    },
  );

  it('persists only the refresh token hash, never the raw token', async (): Promise<void> => {
    const harness = createHarness();
    await authenticate(harness);

    const result = await harness.service.execute({
      email: EMAIL,
      password: PASSWORD,
      traceId: 'trace-hash',
    });

    const stored = harness.unitOfWork.savedRefreshTokens[0]?.snapshot();
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.tokenHash).not.toBe(result.refreshToken);
  });

  describe('negative branches', () => {
    it('rejects an unknown identity and verifies against a null hash', async (): Promise<void> => {
      const harness = await runNegative((h) => {
        h.users.resolveLoginIdentity.mockResolvedValue(null);
      });

      expect(harness.hasher.verifyWithEquivalentCost).toHaveBeenCalledWith(null, PASSWORD);
    });

    it('rejects an inactive identity represented as absent', async (): Promise<void> => {
      const harness = await runNegative((h) => {
        h.users.resolveLoginIdentity.mockResolvedValue(null);
      });

      expect(harness.credentials.findByUserId).not.toHaveBeenCalled();
      expect(harness.hasher.verifyWithEquivalentCost).toHaveBeenCalledWith(null, PASSWORD);
    });

    it('rejects a missing credential', async (): Promise<void> => {
      const harness = await runNegative((h) => {
        h.credentials.findByUserId.mockResolvedValue(null);
      });

      expect(harness.hasher.verifyWithEquivalentCost).toHaveBeenCalledWith(null, PASSWORD);
    });

    it.each(['PENDING', 'REVOKED'] as const)(
      'rejects a %s credential without using its hash',
      async (status): Promise<void> => {
        const harness = await runNegative((h, userId) => {
          h.credentials.findByUserId.mockResolvedValue(credentialFor(userId, status));
        });

        expect(harness.hasher.verifyWithEquivalentCost).toHaveBeenCalledWith(null, PASSWORD);
      },
    );

    it('rejects a wrong password against an ACTIVE hash', async (): Promise<void> => {
      const harness = createHarness();
      await authenticate(harness);
      harness.hasher.verifyWithEquivalentCost.mockResolvedValue(false);

      await expect(
        harness.service.execute({ email: EMAIL, password: 'wrong-password', traceId: 'trace-wrong' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(harness.hasher.verifyWithEquivalentCost).toHaveBeenCalledWith('stored-hash', 'wrong-password');
      expect(harness.issuer.issueNewSession).not.toHaveBeenCalled();
      expect(harness.unitOfWork.savedSessions).toHaveLength(0);
    });

    it('does not authenticate an unknown identity even if the hasher returns true', async (): Promise<void> => {
      const harness = createHarness();
      harness.users.resolveLoginIdentity.mockResolvedValue(null);
      harness.hasher.verifyWithEquivalentCost.mockResolvedValue(true);

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-dummy' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(harness.issuer.issueNewSession).not.toHaveBeenCalled();
      expect(harness.unitOfWork.savedSessions).toHaveLength(0);
    });

    it('does not authenticate an inactive credential even if the hasher returns true', async (): Promise<void> => {
      const harness = createHarness();
      const userId = randomUUID();
      harness.users.resolveLoginIdentity.mockResolvedValue(identity('OWNER', userId));
      harness.credentials.findByUserId.mockResolvedValue(credentialFor(userId, 'REVOKED'));
      harness.hasher.verifyWithEquivalentCost.mockResolvedValue(true);

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-inactive' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(harness.issuer.issueNewSession).not.toHaveBeenCalled();
      expect(harness.unitOfWork.savedSessions).toHaveLength(0);
    });
  });

  describe('normalization and lookup', () => {
    it('normalizes the email sent to Users and keeps the password exact', async (): Promise<void> => {
      const harness = createHarness();
      await authenticate(harness);
      const exactPassword = '  p ässw🔒8  ';

      await harness.service.execute({
        email: '  Jane.Doe@Example.TEST  ',
        password: exactPassword,
        traceId: 'trace-normalized',
      });

      expect(harness.users.resolveLoginIdentity).toHaveBeenCalledWith(EMAIL, 'trace-normalized');
      expect(harness.hasher.verifyWithEquivalentCost).toHaveBeenCalledWith('stored-hash', exactPassword);
    });

    it('resolves the identity from Users on every login', async (): Promise<void> => {
      const harness = createHarness();
      await authenticate(harness);

      await harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-1' });
      await harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-2' });

      expect(harness.users.resolveLoginIdentity).toHaveBeenCalledTimes(2);
      expect(harness.users.resolveLoginIdentity).toHaveBeenNthCalledWith(1, EMAIL, 'trace-1');
      expect(harness.users.resolveLoginIdentity).toHaveBeenNthCalledWith(2, EMAIL, 'trace-2');
    });
  });

  describe('rate limiting', () => {
    it('inspects the rate limit before resolving the identity', async (): Promise<void> => {
      const harness = createHarness();
      await authenticate(harness);

      await harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-order' });

      const inspectOrder = harness.rateLimiter.inspect.mock.invocationCallOrder[0] ?? 0;
      const usersOrder = harness.users.resolveLoginIdentity.mock.invocationCallOrder[0] ?? 0;
      expect(inspectOrder).toBeLessThan(usersOrder);
    });

    it('blocks before Users and Argon2 when the counter is already at the limit', async (): Promise<void> => {
      const harness = createHarness();
      harness.rateLimiter.mode = 'inspect';

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-blocked' }),
      ).rejects.toBeInstanceOf(LoginRateLimitError);

      expect(harness.users.resolveLoginIdentity).not.toHaveBeenCalled();
      expect(harness.hasher.verifyWithEquivalentCost).not.toHaveBeenCalled();
      expect(harness.issuer.issueNewSession).not.toHaveBeenCalled();
    });

    it('returns 401 for the first five failures and 429 on the sixth', async (): Promise<void> => {
      const harness = createHarness();
      harness.users.resolveLoginIdentity.mockResolvedValue(null);
      harness.hasher.verifyWithEquivalentCost.mockResolvedValue(false);

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await expect(
          harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: `trace-${attempt}` }),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
      }

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-6' }),
      ).rejects.toBeInstanceOf(LoginRateLimitError);
    });

    it('clears the failure counter on a successful login', async (): Promise<void> => {
      const harness = createHarness();
      harness.users.resolveLoginIdentity.mockResolvedValue(null);
      harness.hasher.verifyWithEquivalentCost.mockResolvedValue(false);
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await expect(
          harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: `trace-${attempt}` }),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
      }

      await authenticate(harness);
      await harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-success' });

      expect(harness.rateLimiter.clear).toHaveBeenCalledWith(EMAIL);
      expect(harness.rateLimiter.count).toBe(0);

      harness.hasher.verifyWithEquivalentCost.mockResolvedValue(false);
      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-after' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });
  });

  describe('dependency failures fail closed', () => {
    it('does not count a failure when Users is unavailable', async (): Promise<void> => {
      const harness = createHarness();
      harness.users.resolveLoginIdentity.mockRejectedValue(
        new DependencyUnavailableError('users'),
      );

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-users-down' }),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);

      expect(harness.rateLimiter.recordFailure).not.toHaveBeenCalled();
      expect(harness.hasher.verifyWithEquivalentCost).not.toHaveBeenCalled();
    });

    it('propagates a database failure when loading the credential', async (): Promise<void> => {
      const harness = createHarness();
      const userId = randomUUID();
      harness.users.resolveLoginIdentity.mockResolvedValue(identity('GUEST', userId));
      harness.credentials.findByUserId.mockRejectedValue(
        new DependencyUnavailableError('database'),
      );

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-db-down' }),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);

      expect(harness.rateLimiter.recordFailure).not.toHaveBeenCalled();
      expect(harness.issuer.issueNewSession).not.toHaveBeenCalled();
    });

    it('rolls back the session and fails closed when clearing the counter fails', async (): Promise<void> => {
      const harness = createHarness();
      await authenticate(harness);
      harness.rateLimiter.mode = 'clear';

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-clear-down' }),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);

      expect(harness.unitOfWork.savedSessions).toHaveLength(0);
      expect(harness.unitOfWork.savedRefreshTokens).toHaveLength(0);
    });

    it('propagates a persistence failure without returning tokens', async (): Promise<void> => {
      const harness = createHarness();
      await authenticate(harness);
      jest.spyOn(harness.unitOfWork, 'execute').mockRejectedValueOnce(
        new DependencyUnavailableError('database'),
      );

      await expect(
        harness.service.execute({ email: EMAIL, password: PASSWORD, traceId: 'trace-uow-down' }),
      ).rejects.toBeInstanceOf(DependencyUnavailableError);
    });
  });
});
