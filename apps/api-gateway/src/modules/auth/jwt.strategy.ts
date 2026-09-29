import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import CustomStrategy from 'passport-custom';
import type { Request } from 'express';

import {
  JWT_VERIFIER,
  type AccessTokenVerifier,
  type VerifiedUserClaims,
} from '@gateway/application/ports/jwt-verifier.port';

export const USER_JWT_STRATEGY = 'gateway-access-jwt';

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: VerifiedUserClaims['role'];
  readonly jti: string;
  readonly exp: number;
}

@Injectable()
export class GatewayJwtStrategy extends PassportStrategy(
  CustomStrategy,
  USER_JWT_STRATEGY,
  1,
) {
  public constructor(@Inject(JWT_VERIFIER) private readonly verifier: AccessTokenVerifier) {
    super();
  }

  public async validate(request: Request): Promise<AuthenticatedPrincipal> {
    const match = /^Bearer ([^\s]+)$/.exec(request.header('authorization') ?? '');
    const token = match?.[1];
    if (token === undefined) {
      throw new UnauthorizedException('Access token is required');
    }

    let claims: VerifiedUserClaims;
    try {
      claims = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Access token is invalid');
    }

    return {
      userId: claims.sub,
      sessionId: claims.sid,
      role: claims.role,
      jti: claims.jti,
      exp: claims.exp,
    };
  }
}
