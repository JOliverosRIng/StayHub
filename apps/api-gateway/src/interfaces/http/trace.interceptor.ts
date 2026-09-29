import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import { catchError, type Observable, throwError } from 'rxjs';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { ensureTraceId } from '@gateway/interfaces/http/trace-id';

const TRACER_NAME = 'stayhub-api-gateway';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const traceId = ensureTraceId(request);
    response.setHeader('x-trace-id', traceId);
    const route = routeTemplate(context) || request.path;
    const span = trace.getTracer(TRACER_NAME).startSpan(`${request.method} ${route}`, {
      attributes: {
        'http.method': request.method,
        'http.route': route,
        'trace.id': traceId,
      },
    });
    response.once('finish', () => {
      span.setAttribute('http.status_code', response.statusCode);
      if (response.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    });
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof GatewayDependencyError) span.addEvent('dependency_unavailable');
        return throwError(() => error);
      }),
    );
  }
}

function routeTemplate(context: ExecutionContext): string | undefined {
  const controller = firstPath(Reflect.getMetadata(PATH_METADATA, context.getClass()));
  const handler = firstPath(Reflect.getMetadata(PATH_METADATA, context.getHandler()));
  const segments = [controller, handler].filter(
    (segment): segment is string => segment !== undefined && segment !== '' && segment !== '/',
  );
  if (segments.length === 0) return undefined;
  return `/${segments.join('/')}`.replace(/\/{2,}/g, '/');
}

function firstPath(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}
