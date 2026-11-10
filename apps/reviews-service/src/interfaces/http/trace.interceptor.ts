import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { traceId?: string }>(); const response = context.switchToHttp().getResponse<Response>();
    const incoming = request.header('x-request-id'); request.traceId = incoming && /^[A-Za-z0-9._:-]{8,128}$/u.test(incoming) ? incoming : randomUUID();
    response.setHeader('x-request-id', request.traceId); return next.handle();
  }
}
