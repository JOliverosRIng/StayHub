import { randomUUID } from 'node:crypto';

import type { Request } from 'express';

const TRACE_ID = Symbol('traceId');
const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

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

export function traceIdFromRequest(request: Request): string {
  return ensureTraceId(request);
}
