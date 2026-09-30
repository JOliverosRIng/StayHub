import { randomUUID } from 'node:crypto';

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import { catchError, throwError, type Observable } from 'rxjs';

import { DependencyUnavailableError } from '@auth/application/errors/auth-errors';

const TRACE_ID = Symbol('traceId');
const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TRACER_NAME = 'stayhub-auth-service';

type TraceRequest = Request & { [TRACE_ID]?: string };

export function ensureTraceId(request: Request): string {
  const traceRequest = request as TraceRequest;
  const existing = traceRequest[TRACE_ID];
  if (existing !== undefined) return existing;
  const incoming = request.header('x-trace-id');
  const traceId =
    incoming !== undefined && TRACE_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  traceRequest[TRACE_ID] = traceId;
  return traceId;
}

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
        if (error instanceof DependencyUnavailableError) span.addEvent('dependency_unavailable');
        return throwError(() => error);
      }),
    );
  }
}

export function traceIdFromRequest(request: Request): string {
  return ensureTraceId(request);
}

function routeTemplate(context: ExecutionContext): string {
  const controller = firstPath(Reflect.getMetadata(PATH_METADATA, context.getClass()));
  const handler = firstPath(Reflect.getMetadata(PATH_METADATA, context.getHandler()));
  const segments = [controller, handler].filter(
    (segment): segment is string => segment !== undefined && segment !== '' && segment !== '/',
  );
  return `/${segments.join('/')}`.replace(/\/{2,}/g, '/');
}

function firstPath(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}
