import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ServiceJwtVerifier } from '@reviews/infrastructure/security/service-jwt.verifier';
import type { AuthenticatedPrincipal } from '@reviews/infrastructure/security/jwt-verifier';
import { extractSingleBearer } from '@reviews/interfaces/http/auth/bearer-token';

export interface ServiceAuthenticatedRequest extends Request { principal?: AuthenticatedPrincipal; }
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  public constructor(private readonly verifier: ServiceJwtVerifier) {}
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ServiceAuthenticatedRequest>();
    request.principal = await this.verifier.verify(extractSingleBearer(request));
    return true;
  }
}
