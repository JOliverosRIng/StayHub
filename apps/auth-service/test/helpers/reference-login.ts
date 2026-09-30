import { randomUUID } from 'node:crypto';

import type { LoginRateLimiter } from '@auth/application/login/login-rate-limiter';
import type { Clock } from '@auth/application/ports/clock.port';
import type { PasswordHasher } from '@auth/application/ports/password-hasher.port';
import type { CredentialRepository } from '@auth/application/ports/repositories.port';
import type {
  SessionUnitOfWork,
  SessionUnitOfWorkContext,
} from '@auth/application/ports/session-unit-of-work.port';
import type { UserRole } from '@auth/application/ports/users-service.port';
import {
  DependencyUnavailableError,
  LoginRateLimitError,
} from '@auth/application/errors/auth-errors';
import type {
  IssuedSessionSuccessor,
  IssuedSessionTokens,
  SessionTokensIssuer,
} from '@auth/application/sessions/issue-session-tokens.service';
import type { Credential } from '@auth/domain/credentials/credential';
import { RefreshToken } from '@auth/domain/tokens/refresh-token';
import { Session } from '@auth/domain/sessions/session';

export type { LoginRateLimiter, SessionTokensIssuer };

export const LOGIN_TEST_NOW = new Date('2026-01-01T00:00:00.000Z');

export class FakeLoginRateLimiter implements LoginRateLimiter {
  public readonly inspect = jest.fn<Promise<void>, [string]>(() => {
    if (this.mode === 'inspect') throw new LoginRateLimitError(900);
    if (this.count >= this.blockAt) throw new LoginRateLimitError(this.retryAfterSeconds);
    return Promise.resolve();
  });

  public readonly recordFailure = jest.fn<Promise<void>, [string]>(() => {
    if (this.mode === 'record') throw new DependencyUnavailableError('redis');
    this.count += 1;
    if (this.count >= this.blockAt) throw new LoginRateLimitError(this.retryAfterSeconds);
    return Promise.resolve();
  });

  public readonly clear = jest.fn<Promise<void>, [string]>(() => {
    if (this.mode === 'clear') throw new DependencyUnavailableError('redis');
    this.count = 0;
    return Promise.resolve();
  });

  public mode: 'none' | 'inspect' | 'record' | 'clear' = 'none';
  public blockAt = 6;
  public retryAfterSeconds = 900;
  public count = 0;
}

export class FakeSessionTokensIssuer implements SessionTokensIssuer {
  public readonly issueNewSession = jest.fn<Promise<IssuedSessionTokens>, [string, UserRole]>(
    (userId: string, role: UserRole) => {
      const session = Session.create(randomUUID(), userId, role, LOGIN_TEST_NOW);
      const snapshot = session.snapshot();
      const refreshToken = RefreshToken.create(
        randomUUID(),
        snapshot.id,
        'a'.repeat(64),
        LOGIN_TEST_NOW,
        snapshot.absoluteExpiresAt,
      );
      return Promise.resolve({
        session,
        refreshToken,
        accessToken: 'signed.access.token',
        rawRefreshToken: 'raw.refresh.token',
      });
    },
  );

  public readonly issueForSession = jest.fn<Promise<IssuedSessionSuccessor>, [Session]>(
    (session: Session) => {
      const snapshot = session.snapshot();
      const refreshToken = RefreshToken.create(
        randomUUID(),
        snapshot.id,
        'b'.repeat(64),
        LOGIN_TEST_NOW,
        snapshot.absoluteExpiresAt,
      );
      return Promise.resolve({
        refreshToken,
        accessToken: 'signed.access.token',
        rawRefreshToken: 'raw.refresh.token',
      });
    },
  );
}

export class FakeSessionUnitOfWork implements SessionUnitOfWork {
  public readonly savedSessions: Session[] = [];
  public readonly savedRefreshTokens: RefreshToken[] = [];

  public async execute<T>(work: (context: SessionUnitOfWorkContext) => Promise<T>): Promise<T> {
    const sessions: Session[] = [];
    const tokens: RefreshToken[] = [];
    const notImplemented = (): Promise<never> => Promise.reject(new Error('not implemented'));
    const context: SessionUnitOfWorkContext = {
      sessions: {} as SessionUnitOfWorkContext['sessions'],
      refreshTokens: {} as SessionUnitOfWorkContext['refreshTokens'],
      findSessionById: notImplemented,
      findRefreshByHash: notImplemented,
      lockSession: notImplemented,
      lockRefresh: notImplemented,
      saveSession: (session) => {
        sessions.push(session);
        return Promise.resolve();
      },
      insertSuccessor: (token) => {
        tokens.push(token);
        return Promise.resolve();
      },
      markConsumed: notImplemented,
      linkSuccessor: notImplemented,
      revokeActiveForSession: notImplemented,
    };

    const result = await work(context);
    this.savedSessions.push(...sessions);
    this.savedRefreshTokens.push(...tokens);
    return result;
  }
}

export class FakeCredentialRepository implements CredentialRepository {
  public readonly findByUserId = jest.fn<Promise<Credential | null>, [string]>(() =>
    Promise.resolve(null),
  );
  public readonly save = jest.fn<Promise<void>, [Credential]>(() => Promise.resolve());
}

export class FakePasswordHasher implements PasswordHasher {
  public readonly hash = jest.fn<Promise<string>, [string]>(() => Promise.resolve('unused-hash'));
  public readonly verify = jest.fn<Promise<boolean>, [string, string]>(() => Promise.resolve(false));
  public readonly verifyWithEquivalentCost = jest.fn<Promise<boolean>, [string | null, string]>(
    () => Promise.resolve(false),
  );
}

export class StubClock implements Clock {
  public constructor(private readonly instant: Date = LOGIN_TEST_NOW) {}

  public now(): Date {
    return new Date(this.instant.getTime());
  }
}
