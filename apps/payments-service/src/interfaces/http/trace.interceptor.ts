import { randomBytes } from 'node:crypto';
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { defer, finalize, tap } from 'rxjs';
import { SpanKind, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { paymentsTracer } from '../../infrastructure/observability/otel';

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
    const traceId = requestTrace(request);
    response.setHeader('x-trace-id', traceId);
    response.setHeader('Cache-Control', 'no-store');
    const requestWithRoute = request as unknown as { readonly route?: { readonly path?: unknown } };
    const routePath = requestWithRoute.route?.path;
    const route: string = typeof routePath === 'string' ? routePath : request.path;
    return defer(() => paymentsTracer.startActiveSpan(
      'http.server',
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': request.method,
          'http.route': route,
        },
      },
      otelContext.active(),
      (span) => next.handle().pipe(
        tap({ error: () => span.setStatus({ code: SpanStatusCode.ERROR }) }),
        finalize(() => {
          span.setAttribute('http.response.status_code', response.statusCode);
          span.end();
        }),
      ),
    ));
  }
}
