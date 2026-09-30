import { randomUUID } from 'node:crypto';

import type { AuthCache, LoginFailureWindow } from '@auth/application/ports/cache.port';
import type { SessionRepository } from '@auth/application/ports/repositories.port';
import { DependencyUnavailableError, SessionInvalidError } from '@auth/application/errors/auth-errors';
import { ValidateSessionService } from '@auth/application/sessions/validate-session.use-case';
import { Session, type SessionRole } from '@auth/domain/sessions/session';
import { FakeClock } from '../helpers/fake-clock';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const SESSION_ID = randomUUID();
const USER_ID = randomUUID();

class FakeSessionRepository implements SessionRepository {
  public session: Session | null = null;
  public fail = false;

  public findById(): Promise<Session | null> {
    if (this.fail) return Promise.reject(new Error('database unavailable'));
    return Promise.resolve(this.session);
  }

  public save(): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }

  public withLocked<T>(): Promise<T> {
    return Promise.reject(new Error('not implemented'));
  }

  public revoke(): Promise<boolean> {
    return Promise.reject(new Error('not implemented'));
  }
}

class SpyAuthCache implements AuthCache {
  public readonly getCalls: string[] = [];
  public readonly setCalls: Array<{ sessionId: string; value: unknown; ttlSeconds: number }> = [];
  public readonly deleteCalls: string[] = [];
  public cached: unknown = null;
  public failGet = false;
  public failSet = false;
  public failDelete = false;

  public getSession<T>(sessionId: string): Promise<T | null> {
    this.getCalls.push(sessionId);
    if (this.failGet) return Promise.reject(new Error('redis unavailable'));
    return Promise.resolve(this.cached as T | null);
  }

  public setSession<T>(sessionId: string, value: T, ttlSeconds: number): Promise<void> {
    this.setCalls.push({ sessionId, value, ttlSeconds });
    if (this.failSet) return Promise.reject(new Error('redis unavailable'));
    return Promise.resolve();
  }

  public deleteSession(sessionId: string): Promise<void> {
    this.deleteCalls.push(sessionId);
    if (this.failDelete) return Promise.reject(new Error('redis unavailable'));
    return Promise.resolve();
  }

  public readLoginFailures(): Promise<LoginFailureWindow> {
    return Promise.reject(new Error('not implemented'));
  }

  public recordLoginFailure(): Promise<LoginFailureWindow> {
    return Promise.reject(new Error('not implemented'));
  }

  public clearLoginFailures(): Promise<void> {
    return Promise.resolve();
  }

  public ping(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

interface Harness {
  readonly service: ValidateSessionService;
  readonly sessions: FakeSessionRepository;
  readonly cache: SpyAuthCache;
}

function activeSession(role: SessionRole = 'GUEST'): Session {
  return Session.create(SESSION_ID, USER_ID, role, NOW);
}

function build(session: Session | null = activeSession()): Harness {
  const sessions = new FakeSessionRepository();
  sessions.session = session;
  const cache = new SpyAuthCache();
  const service = new ValidateSessionService({ sessions, cache, clock: new FakeClock(NOW) });
  return { service, sessions, cache };
}

function command(overrides: { readonly userId?: string; readonly accessTokenExpiresAt?: Date } = {}): {
  sessionId: string;
  userId: string;
  accessTokenExpiresAt?: Date;
  traceId: string;
} {
  return {
    sessionId: SESSION_ID,
    userId: overrides.userId ?? USER_ID,
    ...(overrides.accessTokenExpiresAt === undefined
      ? {}
      : { accessTokenExpiresAt: overrides.accessTokenExpiresAt }),
    traceId: 'trace-validation',
  };
}

describe('ValidateSessionService (AUTH-068)', () => {
  it.each(['GUEST', 'OWNER', 'ADMIN'] as const)(
    'returns the authoritative %s role for an active session',
    async (role): Promise<void> => {
      const { service } = build(activeSession(role));

      await expect(service.execute(command())).resolves.toEqual({ active: true, role });
    },
  );

  it('rejects an unknown session with a generic 401 and invalidates the cache', async (): Promise<void> => {
    const { service, cache } = build(null);

    await expect(service.execute(command())).rejects.toBeInstanceOf(SessionInvalidError);
    expect(cache.deleteCalls).toEqual([SESSION_ID]);
    expect(cache.setCalls).toHaveLength(0);
  });

  it('rejects a revoked session and invalidates the cache', async (): Promise<void> => {
    const session = activeSession('OWNER');
    session.revoke(NOW, 'SECURITY');
    const { service, cache } = build(session);

    await expect(service.execute(command())).rejects.toBeInstanceOf(SessionInvalidError);
    expect(cache.deleteCalls).toEqual([SESSION_ID]);
    expect(cache.setCalls).toHaveLength(0);
  });

  it('rejects an expired session and invalidates the cache', async (): Promise<void> => {
    const expired = Session.create(
      SESSION_ID,
      USER_ID,
      'GUEST',
      new Date(NOW.getTime() - 8 * 86_400_000),
    );
    const { service, cache } = build(expired);

    await expect(service.execute(command())).rejects.toBeInstanceOf(SessionInvalidError);
    expect(cache.deleteCalls).toEqual([SESSION_ID]);
    expect(cache.setCalls).toHaveLength(0);
  });

  it('rejects a userId mismatch without writing a positive cache', async (): Promise<void> => {
    const { service, cache } = build(activeSession('OWNER'));

    await expect(service.execute(command({ userId: randomUUID() }))).rejects.toBeInstanceOf(
      SessionInvalidError,
    );
    expect(cache.setCalls).toHaveLength(0);
  });

  it('maps a database failure to a dependency error and does not invalidate the cache', async (): Promise<void> => {
    const { service, sessions, cache } = build();
    sessions.fail = true;

    await expect(service.execute(command())).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(cache.deleteCalls).toHaveLength(0);
  });

  it('does not authorize a stale positive cache entry when the session is revoked', async (): Promise<void> => {
    const session = activeSession('OWNER');
    session.revoke(NOW, 'REFRESH_REUSE');
    const { service, cache } = build(session);
    cache.cached = { active: true, role: 'OWNER' };

    await expect(service.execute(command())).rejects.toBeInstanceOf(SessionInvalidError);
    expect(cache.deleteCalls).toEqual([SESSION_ID]);
  });

  it('ignores cache read, write and delete failures', async (): Promise<void> => {
    const { service, cache } = build(activeSession('GUEST'));

    cache.failGet = true;
    await expect(service.execute(command())).resolves.toEqual({ active: true, role: 'GUEST' });

    cache.failGet = false;
    cache.failSet = true;
    await expect(
      service.execute(command({ accessTokenExpiresAt: new Date(NOW.getTime() + 60_000) })),
    ).resolves.toEqual({ active: true, role: 'GUEST' });

    const missing = build(null);
    missing.cache.failDelete = true;
    await expect(missing.service.execute(command())).rejects.toBeInstanceOf(SessionInvalidError);
  });

  it('does not write a positive cache without an access token expiry', async (): Promise<void> => {
    const { service, cache } = build();

    await service.execute(command());

    expect(cache.setCalls).toHaveLength(0);
  });

  it('bounds the positive cache TTL by the access token lifetime', async (): Promise<void> => {
    const { service, cache } = build();

    await service.execute(command({ accessTokenExpiresAt: new Date(NOW.getTime() + 120_000) }));

    expect(cache.setCalls).toEqual([
      { sessionId: SESSION_ID, value: { active: true, role: 'GUEST' }, ttlSeconds: 120 },
    ]);
  });

  it('caps the positive cache TTL at the session absolute expiry', async (): Promise<void> => {
    const { service, cache } = build();

    await service.execute(command({ accessTokenExpiresAt: new Date(NOW.getTime() + 10 * 86_400_000) }));

    expect(cache.setCalls[0]?.ttlSeconds).toBe(604_800);
  });

  it('does not write a non-positive TTL', async (): Promise<void> => {
    const { service, cache } = build();

    await service.execute(command({ accessTokenExpiresAt: new Date(NOW.getTime() - 1000) }));

    expect(cache.setCalls).toHaveLength(0);
  });
});
