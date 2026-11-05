import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '@accommodations/infrastructure/config/accommodations-config';
import { authenticate, bearerToken, type AuthenticatedRequest } from './jwt.strategy';

/** Anonymous access when no Authorization header is sent; a present but invalid bearer is always 401, never anonymous. */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(@Inject(ACCOMMODATIONS_CONFIG) private readonly config: AccommodationsConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (token !== undefined) authenticate(request, this.config, token);
    return true;
  }
}
