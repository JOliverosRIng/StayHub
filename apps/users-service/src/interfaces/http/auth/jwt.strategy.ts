import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { USERS_CONFIG, type UsersConfig } from '@users/infrastructure/config/users-config';
import { verifyJwt } from '@users/infrastructure/security/service-jwt.verifier';
import { bearer } from '../guards/service-auth.guard';
import { UUID_PATTERN } from '@users/domain/users/values';
export interface Principal { sub: string; sid: string; jti: string; role: 'GUEST' | 'OWNER' | 'ADMIN' }
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(USERS_CONFIG) private readonly config: UsersConfig) {
    super({ jwtFromRequest: (req: Request): string => bearer(req), secretOrKey: config.userJwt.publicKey, algorithms: ['RS256'], issuer: config.userJwt.issuer, audience: config.userJwt.audience, passReqToCallback: true });
  }
  validate(req: Request): Principal {
    const claims = verifyJwt(bearer(req), this.config.userJwt, 3600);
    if (![claims.sub, claims.sid, claims.jti].every((v: unknown) => typeof v === 'string' && UUID_PATTERN.test(v)) || !['GUEST', 'OWNER', 'ADMIN'].includes(String(claims.role))) throw new UnauthorizedException();
    return { sub: claims.sub!, sid: claims.sid as string, jti: claims.jti!, role: claims.role as Principal['role'] };
  }
}
