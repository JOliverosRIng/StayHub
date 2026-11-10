import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtVerifier, type AuthenticatedPrincipal } from '../../../infrastructure/security/jwt.verifier';
import { bearerToken } from './bearer-token';

@Injectable()
export class ServiceJwtGuard implements CanActivate {
  constructor(private readonly verifier: JwtVerifier) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedPrincipal }>();
    request.user = this.verifier.verifyService(bearerToken(request));
    return true;
  }
}
