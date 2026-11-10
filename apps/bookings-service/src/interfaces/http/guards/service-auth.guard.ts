import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ServiceJwtVerifier, type ServicePrincipal } from '@bookings/infrastructure/security/service-jwt.verifier';

export interface AuthenticatedRequest extends Request { principal?: ServicePrincipal; }

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  public constructor(private readonly verifier: ServiceJwtVerifier) {}
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ') || value.length <= 7) throw new UnauthorizedException('Bearer token required');
    request.principal = await this.verifier.verify(value.slice(7));
    return true;
  }
}
