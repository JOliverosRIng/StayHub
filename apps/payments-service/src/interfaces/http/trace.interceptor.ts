import { randomBytes } from 'node:crypto';
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Observable } from 'rxjs';

export interface PaymentTraceRequest extends Request {
  traceId?: string;
}

export function requestTrace(request: PaymentTraceRequest): string {
  if (!request.traceId) request.traceId = randomBytes(16).toString('hex');
  return request.traceId;
}

export function traceMiddleware(
): (request: PaymentTraceRequest, response: Response, next: NextFunction) => void {
  return (request, response, next): void => {
    const incoming = request.headers['x-trace-id'];
    if (typeof incoming === 'string' && /^[0-9a-f]{32}$/.test(incoming) && !/^0+$/.test(incoming)) {
      request.traceId = incoming;
    }
    const traceId = requestTrace(request);
    response.setHeader('x-trace-id', traceId);
    response.setHeader('Cache-Control', 'no-store');
    next();
  };
}

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<PaymentTraceRequest>();
    const response = http.getResponse<Response>();
    response.setHeader('x-trace-id', requestTrace(request));
    response.setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}
