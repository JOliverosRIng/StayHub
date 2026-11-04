import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { traceId?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    request.traceId = typeof request.headers['x-trace-id'] === 'string' ? request.headers['x-trace-id'] : randomUUID();
    response.setHeader('x-trace-id', request.traceId);
    return next.handle();
  }
}
