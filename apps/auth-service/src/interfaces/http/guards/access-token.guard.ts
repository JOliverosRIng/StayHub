import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { DependencyUnavailableError } from '@auth/application/errors/auth-errors';
import { ACCESS_JWT_STRATEGY } from '@auth/interfaces/http/auth/jwt.strategy';

/**
 * Guard for access-JWT protected routes. Cryptographic and session rejections become 401, while a
 * `DependencyUnavailableError` from the authoritative session check is preserved as 503 (not converted
 * to 401).
 */
@Injectable()
export class AccessTokenGuard extends AuthGuard(ACCESS_JWT_STRATEGY) {
  public override handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser {
    if (err instanceof DependencyUnavailableError) throw err;
    if (err instanceof HttpException) throw err;
    if (err) throw new UnauthorizedException('Access token is invalid');
    if (!user) throw new UnauthorizedException('Access token is required');
    return user;
  }
}
