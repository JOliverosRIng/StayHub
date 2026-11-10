import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/jwt.verifier';

@Injectable()
export class NotificationOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedPrincipal }>();
    const principal = request.user;
    const requestedId = request.params.id;
    if (principal?.tokenType !== 'access' || (!principal.roles.includes('ADMIN') && principal.sub !== requestedId)) throw new ForbiddenException('Cannot read notifications for this user');
    return true;
  }
}
