import type { NextFunction, Request, Response } from 'express';

import { ensureTraceId } from './trace.interceptor';

export function traceMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('x-trace-id', ensureTraceId(request));
  next();
}
