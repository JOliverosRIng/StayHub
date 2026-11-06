import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@accommodations/domain/properties/property.types';
import { DomainError } from '@accommodations/domain/shared/domain-error';
import type { AuthenticatedRequest } from '../auth/jwt.strategy';
import { ROLES_METADATA } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_METADATA, [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(principal.role)) throw new DomainError('FORBIDDEN');
    return true;
  }
}
