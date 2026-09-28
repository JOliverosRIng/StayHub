export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');

export interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly role: 'GUEST' | 'OWNER' | 'ADMIN';
  readonly jti: string;
}

export interface TokenSigner {
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}

