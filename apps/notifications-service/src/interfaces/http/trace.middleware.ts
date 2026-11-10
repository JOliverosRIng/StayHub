import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const TRACE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function traceMiddleware(request: Request, response: Response, next: NextFunction): void {
  const requested = request.header('x-trace-id');
  const traceId = requested && TRACE_ID_PATTERN.test(requested) ? requested : randomUUID();
  response.setHeader('x-trace-id', traceId);
  (request as Request & { traceId: string }).traceId = traceId;
  next();
}
