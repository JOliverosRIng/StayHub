import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtVerifier, type AuthenticatedPrincipal } from '../../../infrastructure/security/jwt.verifier';
import { bearerToken } from './bearer-token';

@Injectable()
export class SendAuthGuard implements CanActivate {
  constructor(private readonly verifier: JwtVerifier) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedPrincipal }>();
    const token = bearerToken(request);
    try {
      const principal = this.verifier.verifyAccess(token);
      if (!principal.roles.includes('ADMIN')) throw new ForbiddenException('ADMIN role required');
      request.user = principal;
      return true;
    } catch (accessError) {
      if (accessError instanceof ForbiddenException) throw accessError;
    }
    request.user = this.verifier.verifyService(token);
    return true;
  }
}
