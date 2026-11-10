import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '@accommodations/infrastructure/config/accommodations-config';
import { verifyServiceToken } from '@accommodations/infrastructure/security/service-jwt.verifier';
import { bearerToken, type AuthenticatedRequest } from './jwt.strategy';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(@Inject(ACCOMMODATIONS_CONFIG) private readonly config: AccommodationsConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (token === undefined) throw new UnauthorizedException();
    try {
      verifyServiceToken(token, this.config.serviceJwt);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
