import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import CustomStrategy from 'passport-custom';
import type { Request } from 'express';

import {
  VALIDATE_SESSION_USE_CASE,
  type ValidateSessionUseCase,
} from '@auth/application/ports/auth-use-cases.port';
import {
  TOKEN_SIGNER,
  type TokenSigner,
  type VerifiedAccessTokenClaims,
} from '@auth/application/ports/token-signer.port';
import { DependencyUnavailableError } from '@auth/application/errors/auth-errors';
import { traceIdFromRequest } from '@auth/interfaces/http/trace.interceptor';
import type { AuthenticatedPrincipal } from './authenticated-principal';

export const ACCESS_JWT_STRATEGY = 'access-jwt';

/**
 * Custom Passport strategy that delegates cryptography to the existing `TokenSigner` and then requires
 * the authoritative session to be active with the same role (D06). It never re-implements JOSE/PEM
 * verification nor consults Users.
 */
@Injectable()
export class AccessTokenStrategy extends PassportStrategy(
  CustomStrategy,
  ACCESS_JWT_STRATEGY,
  1,
) {
  public constructor(
    @Inject(TOKEN_SIGNER) private readonly tokens: TokenSigner,
    @Inject(VALIDATE_SESSION_USE_CASE) private readonly validateSession: ValidateSessionUseCase,
  ) {
    super();
  }

  public async validate(request: Request): Promise<AuthenticatedPrincipal> {
    const match = /^Bearer ([^\s]+)$/.exec(request.header('authorization') ?? '');
    const token = match?.[1];
    if (token === undefined) {
      throw new UnauthorizedException('Access token is required');
    }

    let claims: VerifiedAccessTokenClaims;
    try {
      claims = await this.tokens.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Access token is invalid');
    }

    let role: AuthenticatedPrincipal['role'];
    try {
      const session = await this.validateSession.execute({
        sessionId: claims.sid,
        userId: claims.sub,
        accessTokenExpiresAt: new Date(claims.exp * 1000),
        traceId: traceIdFromRequest(request),
      });
      role = session.role;
    } catch (error) {
      if (error instanceof DependencyUnavailableError) throw error;
      throw new UnauthorizedException('Session is not active');
    }

    if (role !== claims.role) {
      throw new UnauthorizedException('Access token role does not match the session');
    }

    return { userId: claims.sub, sessionId: claims.sid, role, exp: claims.exp };
  }
}
