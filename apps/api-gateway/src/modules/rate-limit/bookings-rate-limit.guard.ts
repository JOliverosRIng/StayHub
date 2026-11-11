import { HttpException, HttpStatus, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

import { RATE_LIMIT_SCOPE, RateLimitStore } from '@gateway/infrastructure/cache/rate-limit.store';
import { principalFrom } from '@gateway/modules/auth/access.guard';

export const BOOKINGS_RATE_LIMITED = 'BOOKINGS_RATE_LIMITED';

/** Límite aprobado de Bookings por usuario autenticado: GET 60/min; escrituras 10/min. */
@Injectable()
export class BookingsRateLimitGuard implements CanActivate {
  public constructor(private readonly store: RateLimitStore) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const principal = principalFrom(request);
    if (principal === undefined) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });

    const scope = request.method === 'GET'
      ? RATE_LIMIT_SCOPE.BOOKINGS_READ
      : RATE_LIMIT_SCOPE.BOOKINGS_WRITE;
    const decision = await this.store.consume(scope, principal.userId);
    if (decision.allowed) return true;

    http.getResponse<Response>().setHeader('Retry-After', String(decision.retryAfterSeconds));
    throw new HttpException(
      { code: BOOKINGS_RATE_LIMITED, retryAfter: decision.retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
