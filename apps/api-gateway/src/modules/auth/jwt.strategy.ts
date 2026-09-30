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

const BEARER_PATTERN = /^Bearer ([^\s]+)$/;

/**
 * Extrae el bearer de la petición. Es la regla única de lectura del access token: la comparten la
 * estrategia de GW-016 y el `AccessGuard` de GW-040 para que no existan dos extractores distintos.
 */
export function extractBearerToken(request: Request): string | undefined {
  const match = BEARER_PATTERN.exec(request.header('authorization') ?? '');
  return match?.[1];
}

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
    const token = extractBearerToken(request);
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
