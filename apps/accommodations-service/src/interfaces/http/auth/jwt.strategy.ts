import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '@accommodations/infrastructure/config/accommodations-config';
import { verifyAccessToken } from '@accommodations/infrastructure/security/jwt.verifier';
import type { Principal } from '@accommodations/domain/properties/property.types';
import type { TracedRequest } from '../trace.interceptor';

export interface AuthenticatedRequest extends TracedRequest { principal?: Principal }

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/;

/** Returns undefined when no Authorization header is sent; any present but malformed header is a 401. */
export function bearerToken(request: AuthenticatedRequest): string | undefined {
  const header = request.headers.authorization;
  if (header === undefined) return undefined;
  const match = BEARER.exec(header);
  if (!match?.[1]) throw new UnauthorizedException();
  return match[1];
}

export function authenticate(request: AuthenticatedRequest, config: AccommodationsConfig, token: string): Principal {
  try {
    request.principal = verifyAccessToken(token, config.jwt);
    return request.principal;
  } catch {
    throw new UnauthorizedException();
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(ACCOMMODATIONS_CONFIG) private readonly config: AccommodationsConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (token === undefined) throw new UnauthorizedException();
    authenticate(request, this.config, token);
    return true;
  }
}
