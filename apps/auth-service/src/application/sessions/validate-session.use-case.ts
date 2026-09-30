import type {
  ValidateSessionCommand,
  ValidateSessionUseCase,
  ValidatedSession,
} from '@auth/application/ports/auth-use-cases.port';
import type { AuthCache } from '@auth/application/ports/cache.port';
import type { Clock } from '@auth/application/ports/clock.port';
import type { SessionRepository } from '@auth/application/ports/repositories.port';
import {
  DependencyUnavailableError,
  SessionInvalidError,
} from '@auth/application/errors/auth-errors';
import type { Session } from '@auth/domain/sessions/session';

export interface ValidateSessionDependencies {
  readonly sessions: SessionRepository;
  readonly cache: AuthCache;
  readonly clock: Clock;
}

/**
 * Productive session introspection (D06). PostgreSQL is authoritative: a positive cache hint never
 * authorizes before the database is read. Invalid sessions map to a generic 401 and invalidate any stale
 * cache entry best-effort; a database failure maps to 503. A positive cache is only written when a
 * reliable `accessTokenExpiresAt` is provided, bounded by the token and session lifetimes.
 */
export class ValidateSessionService implements ValidateSessionUseCase {
  private readonly sessions: SessionRepository;
  private readonly cache: AuthCache;
  private readonly clock: Clock;

  public constructor(dependencies: ValidateSessionDependencies) {
    this.sessions = dependencies.sessions;
    this.cache = dependencies.cache;
    this.clock = dependencies.clock;
  }

  public async execute(command: ValidateSessionCommand): Promise<ValidatedSession> {
    const now = this.clock.now();
    await this.readCacheHint(command.sessionId);

    let session: Session | null;
    try {
      session = await this.sessions.findById(command.sessionId);
    } catch {
      throw new DependencyUnavailableError('database');
    }

    const snapshot = session?.snapshot();
    if (
      session === null ||
      snapshot === undefined ||
      snapshot.userId !== command.userId ||
      !session.isActive(now)
    ) {
      await this.safeDelete(command.sessionId);
      throw new SessionInvalidError();
    }

    const ttlSeconds = positiveTtlSeconds(
      command.accessTokenExpiresAt,
      now,
      snapshot.absoluteExpiresAt,
    );
    if (ttlSeconds !== null) {
      await this.safeSet(command.sessionId, { active: true, role: snapshot.role }, ttlSeconds);
    }
    return { active: true, role: snapshot.role };
  }

  private async readCacheHint(sessionId: string): Promise<void> {
    try {
      await this.cache.getSession<unknown>(sessionId);
    } catch {
      // A cache read error (Redis down or corrupt JSON) never authorizes or fails the request.
    }
  }

  private async safeDelete(sessionId: string): Promise<void> {
    try {
      await this.cache.deleteSession(sessionId);
    } catch {
      // Best-effort invalidation; the database decision already stands.
    }
  }

  private async safeSet(sessionId: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.cache.setSession(sessionId, value, ttlSeconds);
    } catch {
      // A cache write error must not fail an otherwise valid session.
    }
  }
}

function positiveTtlSeconds(
  accessTokenExpiresAt: Date | undefined,
  now: Date,
  absoluteExpiresAt: Date,
): number | null {
  if (accessTokenExpiresAt === undefined) return null;
  const byToken = Math.floor((accessTokenExpiresAt.getTime() - now.getTime()) / 1000);
  const bySession = Math.floor((absoluteExpiresAt.getTime() - now.getTime()) / 1000);
  const ttl = Math.min(byToken, bySession);
  return ttl > 0 ? ttl : null;
}
