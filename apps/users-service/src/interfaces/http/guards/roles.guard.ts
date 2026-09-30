import { Injectable, UnauthorizedException, ForbiddenException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@users/domain/users/values';
import type { Principal } from '../auth/jwt.strategy';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request & { user?: Principal }>().user;
    if (!user) throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<UserRole[]>('users:roles', [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
