import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AccommodationsLogger } from '@accommodations/infrastructure/logging/accommodations-logger';
export interface TracedRequest extends Request { traceId?: string }
export function requestTrace(request: TracedRequest): string {
  if (!request.traceId) request.traceId = randomBytes(16).toString('hex');
  return request.traceId;
}
export function traceMiddleware(logger: AccommodationsLogger): (req: TracedRequest, res: Response, next: NextFunction) => void {
  return (req, res, next): void => {
    const incoming = req.headers['x-trace-id'];
    if (typeof incoming === 'string' && /^[0-9a-f]{32}$/.test(incoming) && !/^0+$/.test(incoming)) req.traceId = incoming;
    const traceId = requestTrace(req);
    res.setHeader('x-trace-id', traceId);
    res.setHeader('Cache-Control', 'no-store');
    const start = performance.now();
    res.once('finish', () => logger.event('http_request', { traceId, status: res.statusCode, durationMs: Math.round(performance.now() - start) }));
    next();
  };
}
