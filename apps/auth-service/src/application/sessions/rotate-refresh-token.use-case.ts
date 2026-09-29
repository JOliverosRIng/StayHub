import type {
  IssuedTokenPair,
  RotateRefreshCommand,
  RotateRefreshTokenUseCase,
} from '@auth/application/ports/auth-use-cases.port';
import type { AuthCache } from '@auth/application/ports/cache.port';
import type { Clock } from '@auth/application/ports/clock.port';
import type { RefreshTokenCodec } from '@auth/application/ports/refresh-token-codec.port';
import type { RefreshTokenRepository } from '@auth/application/ports/repositories.port';
import type { SessionUnitOfWork } from '@auth/application/ports/session-unit-of-work.port';
import { RefreshTokenInvalidError } from '@auth/application/errors/auth-errors';
import type { SessionTokensIssuer } from './issue-session-tokens.service';

export interface RotateRefreshTokenDependencies {
  readonly refreshTokens: RefreshTokenRepository;
  readonly unitOfWork: SessionUnitOfWork;
  readonly codec: RefreshTokenCodec;
  readonly issuer: SessionTokensIssuer;
  readonly clock: Clock;
  readonly cache: AuthCache;
}

/**
 * Productive refresh rotation (D04). The raw token is only used to derive its HMAC and locate the
 * session; the authoritative decision happens inside the transactional unit of work with the session
 * locked before the token. A consumed token triggers a committed family revocation and a 401; a valid
 * token consumes the old one, inserts a single successor and bumps the session version. Tokens are
 * signed before the commit and only returned once it succeeds.
 */
export class RotateRefreshTokenService implements RotateRefreshTokenUseCase {
  private readonly refreshTokens: RefreshTokenRepository;
  private readonly unitOfWork: SessionUnitOfWork;
  private readonly codec: RefreshTokenCodec;
  private readonly issuer: SessionTokensIssuer;
  private readonly clock: Clock;
  private readonly cache: AuthCache;

  public constructor(dependencies: RotateRefreshTokenDependencies) {
    this.refreshTokens = dependencies.refreshTokens;
    this.unitOfWork = dependencies.unitOfWork;
    this.codec = dependencies.codec;
    this.issuer = dependencies.issuer;
    this.clock = dependencies.clock;
    this.cache = dependencies.cache;
  }

  public async execute(command: RotateRefreshCommand): Promise<IssuedTokenPair> {
    const tokenHash = this.codec.hash(command.refreshToken);
    const located = await this.refreshTokens.findByHash(tokenHash);
    if (located === null) throw new RefreshTokenInvalidError();
    const sessionId = located.snapshot().sessionId;

    const outcome = await this.unitOfWork.execute(async (context) => {
      const session = await context.lockSession(sessionId);
      const current = await context.lockRefresh(tokenHash);
      const now = this.clock.now();

      if (session === null || current === null || !session.isActive(now)) {
        return { kind: 'invalid' } as const;
      }

      const currentSnapshot = current.snapshot();
      if (currentSnapshot.status === 'CONSUMED') {
        session.revoke(now, 'REFRESH_REUSE');
        await context.saveSession(session);
        await context.revokeActiveForSession(sessionId);
        return { kind: 'replay', sessionId } as const;
      }
      if (currentSnapshot.status !== 'ACTIVE' || now >= currentSnapshot.expiresAt) {
        return { kind: 'invalid' } as const;
      }

      const issued = await this.issuer.issueForSession(session);
      const sessionSnapshot = session.snapshot();

      await context.markConsumed(currentSnapshot.id, now);
      await context.insertSuccessor(issued.refreshToken);
      await context.linkSuccessor(currentSnapshot.id, issued.refreshToken.snapshot().id);
      session.incrementVersion();
      await context.saveSession(session);

      return {
        kind: 'rotated',
        pair: {
          accessToken: issued.accessToken,
          refreshToken: issued.rawRefreshToken,
          expiresIn: 3600,
          absoluteExpiresAt: sessionSnapshot.absoluteExpiresAt,
          principal: { userId: sessionSnapshot.userId, sessionId, role: sessionSnapshot.role },
        },
      } as const;
    });

    if (outcome.kind === 'replay') {
      await this.invalidateSessionCache(outcome.sessionId);
      throw new RefreshTokenInvalidError();
    }
    if (outcome.kind === 'invalid') throw new RefreshTokenInvalidError();
    return outcome.pair;
  }

  private async invalidateSessionCache(sessionId: string): Promise<void> {
    try {
      await this.cache.deleteSession(sessionId);
    } catch {
      // Best effort: the PostgreSQL revocation is already committed and authoritative.
    }
  }
}
