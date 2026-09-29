import type {
  AccessTokenClaims,
  TokenSigner,
  VerifiedAccessTokenClaims,
} from '@auth/application/ports/token-signer.port';

/**
 * Deterministic access-token signer for rotation tests. It records the signed claims and can be told
 * to fail once, so a signing failure can be injected before the unit of work commits.
 */
export class StubAccessTokenSigner implements TokenSigner {
  public failNext = false;
  public readonly signed: AccessTokenClaims[] = [];

  public signAccessToken(claims: AccessTokenClaims): Promise<string> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('sign-failure'));
    }
    this.signed.push(claims);
    return Promise.resolve(`access-token.${claims.jti}`);
  }

  public verifyAccessToken(): Promise<VerifiedAccessTokenClaims> {
    return Promise.reject(new Error('verifyAccessToken is not used in rotation'));
  }
}
