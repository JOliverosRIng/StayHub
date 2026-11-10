import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/jwt.verifier';

export const REQUIRED_ROLES = 'notifications:required-roles';
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_ROLES, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]) ?? [];
    const principal = context.switchToHttp().getRequest<Request & { user?: AuthenticatedPrincipal }>().user;
    if (required.length && !required.some((role) => principal?.roles.includes(role))) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
