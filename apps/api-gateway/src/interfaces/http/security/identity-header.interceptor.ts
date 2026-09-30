import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

export const STRIPPED_REQUEST_HEADERS: readonly string[] = [
  'x-user-id',
  'x-user-role',
  'x-user-email',
  'x-session-id',
  'x-authenticated-user',
  'x-forwarded-user',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-real-ip',
  'x-client-ip',
  'forwarded',
  'x-service-token',
  'x-service-auth',
  'x-service-jwt',
  'x-service-authorization',
  'x-api-key',
  'x-internal-token',
];

const STRIPPED = new Set(STRIPPED_REQUEST_HEADERS);

@Injectable()
export class IdentityHeaderInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    stripClientHeaders(context.switchToHttp().getRequest<Request>());
    return next.handle();
  }
}

export function stripClientHeaders(request: Request): void {
  const headers = request.headers as Record<string, unknown>;
  for (const name of Object.keys(headers)) {
    if (STRIPPED.has(name.toLowerCase())) delete headers[name];
  }
}
