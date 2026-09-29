import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { UserRole } from '@auth/application/ports/users-service.port';
import type { AuthenticatedPrincipal } from '@auth/interfaces/http/auth/authenticated-principal';
import { ROLES_KEY } from './roles.decorator';

/**
 * Authorization guard. It reads the required roles from metadata and the already-validated principal on
 * the request; it never trusts client headers, body fields or unverified claims. Missing principal is a
 * 401, an authenticated principal lacking the role is a 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedPrincipal }>();
    const user = request.user;
    if (user === undefined) {
      throw new UnauthorizedException('Authentication is required');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
