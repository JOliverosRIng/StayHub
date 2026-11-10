import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ServiceJwtVerifier, type ServicePrincipal } from '@bookings/infrastructure/security/service-jwt.verifier';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';

export interface ReviewAuthenticatedRequest extends Request { principal?: ServicePrincipal; }

@Injectable()
export class ReviewServiceGuard implements CanActivate {
  public constructor(private readonly verifier: ServiceJwtVerifier, @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig) {}
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ReviewAuthenticatedRequest>();
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ') || value.length <= 7) throw new UnauthorizedException('Bearer token required');
    request.principal = await this.verifier.verify(value.slice(7), { scope: this.config.reviewEligibilityScope, audience: this.config.reviewEligibilityAudience });
    return true;
  }
}
