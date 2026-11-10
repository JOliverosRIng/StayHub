import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import type { AuthenticatedPrincipal } from '@reviews/infrastructure/security/jwt-verifier';
import { extractSingleBearer } from '@reviews/interfaces/http/auth/bearer-token';

export interface UserAuthenticatedRequest extends Request { principal?: AuthenticatedPrincipal; }
@Injectable()
export class UserAuthGuard implements CanActivate {
  public constructor(private readonly verifier: UserJwtVerifier) {}
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UserAuthenticatedRequest>();
    request.principal = await this.verifier.verify(extractSingleBearer(request));
    return true;
  }
}
