import type { Clock } from '@auth/application/ports/clock.port';
import type { RefreshTokenCodec } from '@auth/application/ports/refresh-token-codec.port';
import type { UuidGenerator } from '@auth/application/ports/random.port';
import type { TokenSigner } from '@auth/application/ports/token-signer.port';
import { Session, type SessionRole } from '@auth/domain/sessions/session';
import { RefreshToken } from '@auth/domain/tokens/refresh-token';

export const ISSUE_SESSION_TOKENS = Symbol('ISSUE_SESSION_TOKENS');

export interface IssuedSessionTokens {
  readonly session: Session;
  readonly refreshToken: RefreshToken;
  readonly accessToken: string;
  readonly rawRefreshToken: string;
}

export interface IssuedSessionSuccessor {
  readonly refreshToken: RefreshToken;
  readonly accessToken: string;
  readonly rawRefreshToken: string;
}

export interface SessionTokensIssuer {
  issueNewSession(userId: string, role: SessionRole): Promise<IssuedSessionTokens>;
  issueForSession(session: Session): Promise<IssuedSessionSuccessor>;
}

export interface IssueSessionTokensDeps {
  readonly codec: RefreshTokenCodec;
  readonly signer: TokenSigner;
  readonly uuid: UuidGenerator;
  readonly clock: Clock;
}

/**
 * Prepares and signs an access/refresh pair (D04/D05). It never persists: the caller coordinates the
 * `SessionUnitOfWork` transaction. The same token rules (32-byte raw refresh, HMAC hash, absolute
 * session expiry, 3600s access claims) are shared by login and rotation.
 */
export class IssueSessionTokensService implements SessionTokensIssuer {
  public constructor(private readonly deps: IssueSessionTokensDeps) {}

  public async issueNewSession(userId: string, role: SessionRole): Promise<IssuedSessionTokens> {
    const now = this.deps.clock.now();
    const session = Session.create(this.deps.uuid.generate(), userId, role, now);
    const issued = await this.issueTokens(session, now);
    return { session, ...issued };
  }

  public async issueForSession(session: Session): Promise<IssuedSessionSuccessor> {
    return this.issueTokens(session, this.deps.clock.now());
  }

  private async issueTokens(session: Session, now: Date): Promise<IssuedSessionSuccessor> {
    const snapshot = session.snapshot();
    const rawRefreshToken = this.deps.codec.generateRawToken();
    const refreshToken = RefreshToken.create(
      this.deps.uuid.generate(),
      snapshot.id,
      this.deps.codec.hash(rawRefreshToken),
      now,
      snapshot.absoluteExpiresAt,
    );
    const accessToken = await this.deps.signer.signAccessToken({
      sub: snapshot.userId,
      sid: snapshot.id,
      role: snapshot.role,
      jti: this.deps.uuid.generate(),
    });
    return { refreshToken, accessToken, rawRefreshToken };
  }
}
