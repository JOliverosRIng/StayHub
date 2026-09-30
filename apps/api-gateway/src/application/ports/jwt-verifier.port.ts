export const JWT_VERIFIER = Symbol('JWT_VERIFIER');

export type UserRole = 'GUEST' | 'OWNER' | 'ADMIN';

export interface VerifiedUserClaims {
  readonly sub: string;
  readonly sid: string;
  readonly role: UserRole;
  readonly jti: string;
  readonly iat: number;
  readonly exp: number;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<VerifiedUserClaims>;
}
