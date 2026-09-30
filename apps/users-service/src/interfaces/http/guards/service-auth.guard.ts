import { Inject, Injectable, ForbiddenException, UnauthorizedException, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { USERS_CONFIG, type UsersConfig } from '@users/infrastructure/config/users-config';
import { verifyJwt } from '@users/infrastructure/security/service-jwt.verifier';
export const ServiceScope = (scope: 'registration' | 'lookup'): ReturnType<typeof SetMetadata> => SetMetadata('users:scope', scope);
export function bearer(request: Request): string {
  const auth = request.headers.authorization;
  if (typeof auth !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(auth)) throw new UnauthorizedException();
  if (request.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === 'authorization').length > 1) throw new UnauthorizedException();
  return auth.slice(7);
}
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(@Inject(USERS_CONFIG) private readonly config: UsersConfig, private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const payload = verifyJwt(bearer(context.switchToHttp().getRequest<Request>()), this.config.serviceJwt, 300);
    const scope = this.reflector.getAllAndOverride<'registration' | 'lookup'>('users:scope', [context.getHandler(), context.getClass()]);
    const expected = scope === 'registration' ? this.config.registrationScope : scope === 'lookup' ? this.config.lookupScope : undefined;
    if (!expected || typeof payload.scope !== 'string' || !payload.scope.split(' ').includes(expected)) throw new ForbiddenException();
    return true;
  }
}
