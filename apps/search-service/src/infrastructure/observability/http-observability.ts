import { context, trace, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { recordHttpDuration, searchTracer } from './otel';
import type { SearchLogger } from './search-logger';

export function observeHttp(logger: SearchLogger): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next): void => {
    const route = ['/internal/v1/search', '/internal/v1/search/suggest', '/health/live', '/health/ready'].includes(req.path) ? req.path : 'unmatched';
    const method = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(req.method) ? req.method : 'OTHER';
    const parent = propagation.extract(context.active(), req.headers);
    const span = searchTracer.startSpan(`${method} ${route}`, { kind: SpanKind.SERVER, attributes: { 'http.request.method': method, 'http.route': route } }, parent);
    const incoming = req.headers['x-trace-id'];
    const traceId = typeof incoming === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(incoming) ? incoming : randomUUID();
    (req as Request & { traceId: string }).traceId = traceId;
    res.setHeader('x-trace-id', traceId);
    const started = performance.now();
    let finished = false;
    const complete = (): void => {
      if (finished) return;
      finished = true;
      const status = res.writableFinished ? res.statusCode : 499;
      const durationMs = performance.now() - started;
      span.setAttribute('http.response.status_code', status);
      if (status >= 500 || status === 499) span.setStatus({ code: SpanStatusCode.ERROR });
      recordHttpDuration(durationMs, { route, method, status });
      context.with(traceContext, () => logger.info('http.request.completed', { route, method, status, durationMs, traceId }));
      span.end();
    };
    const traceContext = trace.setSpan(parent, span);
    res.once('finish', complete); res.once('close', complete);
    context.with(traceContext, next);
  };
}
