import type { LoginCommand, LoginUseCase, IssuedTokenPair } from '@auth/application/ports/auth-use-cases.port';
import type { PasswordHasher } from '@auth/application/ports/password-hasher.port';
import type { CredentialRepository } from '@auth/application/ports/repositories.port';
import type {
  SessionUnitOfWork,
  SessionUnitOfWorkContext,
} from '@auth/application/ports/session-unit-of-work.port';
import type { LoginIdentity } from '@auth/application/ports/users-service.port';
import { InvalidCredentialsError } from '@auth/application/errors/auth-errors';
import type { SessionTokensIssuer } from '@auth/application/sessions/issue-session-tokens.service';
import type { LoginRateLimiter } from './login-rate-limiter';

export interface LoginIdentityResolver {
  resolveLoginIdentity(normalizedEmail: string, traceId: string): Promise<LoginIdentity | null>;
}

export interface LoginDependencies {
  readonly users: LoginIdentityResolver;
  readonly credentials: CredentialRepository;
  readonly hasher: PasswordHasher;
  readonly rateLimiter: LoginRateLimiter;
  readonly unitOfWork: SessionUnitOfWork;
  readonly issuer: SessionTokensIssuer;
}

/**
 * Productive login flow (D05). It normalizes the email, applies the rate limit, resolves the identity
 * in Users, verifies an ACTIVE credential (dummy hash otherwise), and on success issues the tokens and
 * persists Session + first RefreshToken inside a single unit of work, clearing the failure counter
 * before committing. Credential failures stay indistinguishable (same 401); dependency failures 503.
 */
export class LoginService implements LoginUseCase {
  private readonly users: LoginIdentityResolver;
  private readonly credentials: CredentialRepository;
  private readonly hasher: PasswordHasher;
  private readonly rateLimiter: LoginRateLimiter;
  private readonly unitOfWork: SessionUnitOfWork;
  private readonly issuer: SessionTokensIssuer;

  public constructor(dependencies: LoginDependencies) {
    this.users = dependencies.users;
    this.credentials = dependencies.credentials;
    this.hasher = dependencies.hasher;
    this.rateLimiter = dependencies.rateLimiter;
    this.unitOfWork = dependencies.unitOfWork;
    this.issuer = dependencies.issuer;
  }

  public async execute(command: LoginCommand): Promise<IssuedTokenPair> {
    const email = command.email.trim().toLowerCase();

    await this.rateLimiter.inspect(email);

    const identity = await this.users.resolveLoginIdentity(email, command.traceId);
    const credential =
      identity === null ? null : await this.credentials.findByUserId(identity.userId);
    const activeCredential =
      credential !== null && credential.snapshot().status === 'ACTIVE' ? credential : null;

    const activeHash = activeCredential?.snapshot().passwordHash ?? null;
    const passwordMatches = await this.hasher.verifyWithEquivalentCost(activeHash, command.password);

    if (identity === null || activeCredential === null || !passwordMatches) {
      await this.rateLimiter.recordFailure(email);
      throw new InvalidCredentialsError();
    }

    const issued = await this.issuer.issueNewSession(identity.userId, identity.role);
    const session = issued.session.snapshot();

    await this.unitOfWork.execute(async (context: SessionUnitOfWorkContext) => {
      await this.rateLimiter.clear(email);
      await context.saveSession(issued.session);
      await context.insertSuccessor(issued.refreshToken);
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.rawRefreshToken,
      expiresIn: 3600,
      absoluteExpiresAt: session.absoluteExpiresAt,
      principal: { userId: session.userId, sessionId: session.id, role: session.role },
    };
  }
}
