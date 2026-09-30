import { randomBytes } from 'node:crypto';
import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { Observable } from 'rxjs';
import type { UsersLogger } from '@users/infrastructure/logging/users-logger';
export interface UsersRequest extends Request { traceId?: string }
export function requestTrace(request: UsersRequest): string {
  if (!request.traceId) request.traceId = randomBytes(16).toString('hex');
  return request.traceId;
}
export function traceMiddleware(logger: UsersLogger): (req: UsersRequest, res: Response, next: NextFunction) => void {
  return (req, res, next): void => {
    const incoming = req.headers['x-trace-id'];
    if (typeof incoming === 'string' && /^[0-9a-f]{32}$/.test(incoming) && !/^0+$/.test(incoming)) req.traceId = incoming;
    const traceId = requestTrace(req);
    res.setHeader('x-trace-id', traceId);
    res.setHeader('Cache-Control', 'no-store');
    const start = performance.now();
    res.once('finish', () => logger.event('http_request', { traceId, status: res.statusCode, durationMs: Math.round(performance.now() - start) }));
    next();
  };
}
@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> { requestTrace(context.switchToHttp().getRequest<UsersRequest>()); return next.handle(); }
}
