import { createHash, randomUUID } from 'node:crypto';

import type { AuthCache } from '@auth/application/ports/cache.port';
import type { RefreshTokenCodec } from '@auth/application/ports/refresh-token-codec.port';
import type { RefreshTokenRepository } from '@auth/application/ports/repositories.port';
import type {
  SessionUnitOfWork,
  SessionUnitOfWorkContext,
} from '@auth/application/ports/session-unit-of-work.port';
import type {
  IssuedSessionSuccessor,
  IssuedSessionTokens,
  SessionTokensIssuer,
} from '@auth/application/sessions/issue-session-tokens.service';
import { RotateRefreshTokenService } from '@auth/application/sessions/rotate-refresh-token.use-case';
import { RefreshTokenInvalidError } from '@auth/application/errors/auth-errors';
import type { SessionRole, SessionRevokeReason } from '@auth/domain/sessions/session';
import { Session } from '@auth/domain/sessions/session';
import { RefreshToken, type RefreshTokenStatus } from '@auth/domain/tokens/refresh-token';
import { FakeClock } from '../helpers/fake-clock';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const ABSOLUTE_EXPIRY = new Date('2026-10-05T12:00:00.000Z');
const RAW = 'raw-refresh-token-under-test';
const SESSION_ID = randomUUID();
const USER_ID = randomUUID();

const codec: RefreshTokenCodec = {
  generateRawToken: (): string => `generated-${randomUUID()}`,
  hash: (raw: string): string => createHash('sha256').update(raw).digest('hex'),
};

class FakeRefreshTokenRepository implements RefreshTokenRepository {
  public token: RefreshToken | null = null;

  public findByHash(): Promise<RefreshToken | null> {
    return Promise.resolve(this.token);
  }

  public save(): Promise<void> {
    return Promise.resolve();
  }

  public withLocked<T>(): Promise<T> {
    return Promise.reject(new Error('not implemented'));
  }

  public revokeActiveForSession(): Promise<number> {
    return Promise.resolve(0);
  }
}

class FakeSessionUnitOfWork implements SessionUnitOfWork {
  public executed = false;
  public readonly calls: string[] = [];

  public constructor(
    public session: Session | null,
    public token: RefreshToken | null,
    public readonly failure?: Error,
  ) {}

  public async execute<T>(work: (context: SessionUnitOfWorkContext) => Promise<T>): Promise<T> {
    this.executed = true;
    if (this.failure !== undefined) throw this.failure;
    const context: SessionUnitOfWorkContext = {
      sessions: {} as SessionUnitOfWorkContext['sessions'],
      refreshTokens: {} as SessionUnitOfWorkContext['refreshTokens'],
      findSessionById: (): Promise<never> => Promise.reject(new Error('not implemented')),
      findRefreshByHash: (): Promise<never> => Promise.reject(new Error('not implemented')),
      lockSession: (): Promise<Session | null> => {
        this.calls.push('lockSession');
        return Promise.resolve(this.session);
      },
      lockRefresh: (): Promise<RefreshToken | null> => {
        this.calls.push('lockRefresh');
        return Promise.resolve(this.token);
      },
      saveSession: (): Promise<void> => {
        this.calls.push('saveSession');
        return Promise.resolve();
      },
      insertSuccessor: (): Promise<void> => {
        this.calls.push('insertSuccessor');
        return Promise.resolve();
      },
      markConsumed: (): Promise<void> => {
        this.calls.push('markConsumed');
        return Promise.resolve();
      },
      linkSuccessor: (): Promise<void> => {
        this.calls.push('linkSuccessor');
        return Promise.resolve();
      },
      revokeActiveForSession: (): Promise<number> => {
        this.calls.push('revokeActiveForSession');
        return Promise.resolve(1);
      },
    };
    return work(context);
  }
}

class FakeSessionTokensIssuer implements SessionTokensIssuer {
  public fail = false;

  public readonly issueForSession = jest.fn<Promise<IssuedSessionSuccessor>, [Session]>(
    (session: Session) => {
      if (this.fail) return Promise.reject(new Error('sign-failure'));
      const snapshot = session.snapshot();
      const successor = RefreshToken.create(
        randomUUID(),
        snapshot.id,
        'c'.repeat(64),
        NOW,
        snapshot.absoluteExpiresAt,
      );
      return Promise.resolve({
        refreshToken: successor,
        accessToken: 'signed.access.token',
        rawRefreshToken: 'raw.successor.token',
      });
    },
  );

  public readonly issueNewSession = jest.fn<Promise<IssuedSessionTokens>, [string, SessionRole]>(
    (): Promise<IssuedSessionTokens> => Promise.reject(new Error('not used')),
  );
}

function buildCache(): AuthCache & { readonly deleteSession: jest.Mock<Promise<void>, [string]> } {
  return {
    readLoginFailures: (): Promise<never> => Promise.reject(new Error('not implemented')),
    recordLoginFailure: (): Promise<never> => Promise.reject(new Error('not implemented')),
    clearLoginFailures: (): Promise<void> => Promise.resolve(),
    getSession: (): Promise<null> => Promise.resolve(null),
    setSession: (): Promise<void> => Promise.resolve(),
    deleteSession: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
    ping: (): Promise<boolean> => Promise.resolve(true),
  };
}

function sessionWith(revoked: boolean): Session {
  const session = Session.create(SESSION_ID, USER_ID, 'OWNER', NOW);
  if (revoked) session.revoke(NOW, 'SECURITY' as SessionRevokeReason);
  return session;
}

function tokenWith(
  status: RefreshTokenStatus,
  expiresAt: Date = ABSOLUTE_EXPIRY,
): RefreshToken {
  return RefreshToken.rehydrate({
    id: randomUUID(),
    sessionId: SESSION_ID,
    tokenHash: codec.hash(RAW),
    status,
    issuedAt: NOW,
    expiresAt,
    consumedAt: status === 'CONSUMED' ? NOW : null,
    replacedByTokenId: null,
  });
}

interface Harness {
  readonly service: RotateRefreshTokenService;
  readonly repository: FakeRefreshTokenRepository;
  readonly unitOfWork: FakeSessionUnitOfWork;
  readonly issuer: FakeSessionTokensIssuer;
  readonly cache: ReturnType<typeof buildCache>;
}

function build(
  options: {
    readonly session?: Session | null;
    readonly token?: RefreshToken | null;
    readonly failure?: Error;
  } = {},
): Harness {
  const repository = new FakeRefreshTokenRepository();
  repository.token = options.token ?? tokenWith('ACTIVE');
  const unitOfWork = new FakeSessionUnitOfWork(
    options.session ?? sessionWith(false),
    repository.token,
    options.failure,
  );
  const issuer = new FakeSessionTokensIssuer();
  const cache = buildCache();
  const service = new RotateRefreshTokenService({
    refreshTokens: repository,
    unitOfWork,
    codec,
    issuer,
    clock: new FakeClock(NOW),
    cache,
  });
  return { service, repository, unitOfWork, issuer, cache };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('RotateRefreshTokenService (AUTH-067)', () => {
  it('rejects an unknown raw token without opening a transaction', async (): Promise<void> => {
    const harness = build();
    harness.repository.token = null;

    const error = await captureRejection(harness.service.execute({ refreshToken: RAW, traceId: 't' }));

    expect(error).toBeInstanceOf(RefreshTokenInvalidError);
    expect(harness.unitOfWork.executed).toBe(false);
    expect(harness.cache.deleteSession).not.toHaveBeenCalled();
  });

  it('rotates an ACTIVE token, bumping the version and preserving identity', async (): Promise<void> => {
    const session = sessionWith(false);
    const harness = build({ session });

    const pair = await harness.service.execute({ refreshToken: RAW, traceId: 't' });

    expect(pair.expiresIn).toBe(3600);
    expect(pair.refreshToken).toBe('raw.successor.token');
    expect(pair.accessToken).toBe('signed.access.token');
    expect(pair.absoluteExpiresAt.toISOString()).toBe(ABSOLUTE_EXPIRY.toISOString());
    expect(pair.principal).toEqual({ userId: USER_ID, sessionId: SESSION_ID, role: 'OWNER' });
    expect(harness.unitOfWork.calls).toEqual([
      'lockSession',
      'lockRefresh',
      'markConsumed',
      'insertSuccessor',
      'linkSuccessor',
      'saveSession',
    ]);
    expect(session.snapshot().version).toBe(2);
    expect(harness.issuer.issueForSession).toHaveBeenCalledTimes(1);
    expect(harness.cache.deleteSession).not.toHaveBeenCalled();
  });

  it('never rotates a REVOKED token', async (): Promise<void> => {
    const harness = build({ token: tokenWith('REVOKED') });

    const error = await captureRejection(harness.service.execute({ refreshToken: RAW, traceId: 't' }));

    expect(error).toBeInstanceOf(RefreshTokenInvalidError);
    expect(harness.unitOfWork.calls).not.toContain('insertSuccessor');
  });

  it('rejects an expired token on an active session', async (): Promise<void> => {
    const harness = build({
      token: tokenWith('ACTIVE', new Date(NOW.getTime() - 3_600_000)),
    });

    const error = await captureRejection(harness.service.execute({ refreshToken: RAW, traceId: 't' }));

    expect(error).toBeInstanceOf(RefreshTokenInvalidError);
    expect(harness.unitOfWork.calls).not.toContain('insertSuccessor');
  });

  it('rejects a token whose session is revoked', async (): Promise<void> => {
    const harness = build({ session: sessionWith(true) });

    const error = await captureRejection(harness.service.execute({ refreshToken: RAW, traceId: 't' }));

    expect(error).toBeInstanceOf(RefreshTokenInvalidError);
    expect(harness.unitOfWork.calls).not.toContain('insertSuccessor');
  });

  it('commits the family revocation on replay and then returns 401', async (): Promise<void> => {
    const session = sessionWith(false);
    const harness = build({ session, token: tokenWith('CONSUMED') });

    const error = await captureRejection(harness.service.execute({ refreshToken: RAW, traceId: 't' }));

    expect(error).toBeInstanceOf(RefreshTokenInvalidError);
    expect(session.snapshot().revokeReason).toBe('REFRESH_REUSE');
    expect(harness.unitOfWork.calls).toContain('saveSession');
    expect(harness.unitOfWork.calls).toContain('revokeActiveForSession');
    expect(harness.unitOfWork.calls).not.toContain('insertSuccessor');
    expect(harness.cache.deleteSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('still revokes when the cache invalidation fails', async (): Promise<void> => {
    const session = sessionWith(false);
    const harness = build({ session, token: tokenWith('CONSUMED') });
    harness.cache.deleteSession.mockRejectedValueOnce(new Error('redis-down'));

    const error = await captureRejection(harness.service.execute({ refreshToken: RAW, traceId: 't' }));

    expect(error).toBeInstanceOf(RefreshTokenInvalidError);
    expect(session.snapshot().revokeReason).toBe('REFRESH_REUSE');
  });

  it('propagates a technical transaction failure without touching the cache', async (): Promise<void> => {
    const harness = build({ failure: new Error('database-down') });

    await expect(harness.service.execute({ refreshToken: RAW, traceId: 't' })).rejects.toThrow(
      'database-down',
    );
    expect(harness.cache.deleteSession).not.toHaveBeenCalled();
  });

  it('rolls back when signing the successor fails', async (): Promise<void> => {
    const harness = build();
    harness.issuer.fail = true;

    await expect(harness.service.execute({ refreshToken: RAW, traceId: 't' })).rejects.toThrow(
      'sign-failure',
    );
    expect(harness.unitOfWork.calls).not.toContain('markConsumed');
    expect(harness.cache.deleteSession).not.toHaveBeenCalled();
  });
});
