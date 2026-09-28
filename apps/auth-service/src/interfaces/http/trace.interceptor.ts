import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

const TRACE_ID = Symbol('traceId');

type TraceRequest = Request & { [TRACE_ID]?: string };

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<TraceRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const incoming = request.header('x-trace-id');
    const traceId = incoming !== undefined && /^[A-Za-z0-9_-]{8,128}$/.test(incoming)
      ? incoming
      : randomUUID();
    request[TRACE_ID] = traceId;
    response.setHeader('x-trace-id', traceId);
    return next.handle();
  }
}

export function traceIdFromRequest(request: Request): string {
  return (request as TraceRequest)[TRACE_ID] ?? randomUUID();
}

