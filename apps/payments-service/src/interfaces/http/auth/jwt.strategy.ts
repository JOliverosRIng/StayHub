import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../../infrastructure/config/payments-config';
import { verifyUserJwt } from '../../../infrastructure/security/jwt.verifier';
import { bearer } from './bearer';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_TOKEN_MAX_AGE_SECONDS = 3_600;

export interface PaymentPrincipal {
  readonly sub: string;
  readonly sid: string;
  readonly jti: string;
  readonly role: 'GUEST' | 'OWNER' | 'ADMIN';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig) {
    super({
      jwtFromRequest: (request: Request): string => bearer(request),
      secretOrKey: config.userJwt.publicKey,
      algorithms: ['RS256'],
      issuer: config.userJwt.issuer,
      audience: config.userJwt.audience,
      passReqToCallback: true,
    });
  }

  validate(request: Request): PaymentPrincipal {
    return verifyPaymentUserPrincipal(bearer(request), this.config.userJwt);
  }
}

export function verifyPaymentUserPrincipal(token: string, config: PaymentsConfig['userJwt']): PaymentPrincipal {
  const claims = verifyUserJwt(token, config, USER_TOKEN_MAX_AGE_SECONDS);
  if (
    ![claims.sub, claims.sid, claims.jti].every((value: unknown) => typeof value === 'string' && UUID_PATTERN.test(value)) ||
    !['GUEST', 'OWNER', 'ADMIN'].includes(String(claims.role))
  ) {
    throw new UnauthorizedException();
  }
  return {
    sub: claims.sub!,
    sid: claims.sid as string,
    jti: claims.jti!,
    role: claims.role as PaymentPrincipal['role'],
  };
}
