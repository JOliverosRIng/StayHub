import { Injectable } from '@nestjs/common';

const REDACTED_KEYS = new Set(['authorization', 'token', 'jwt', 'comment', 'payload', 'guestId']);
function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, REDACTED_KEYS.has(key) ? '[REDACTED]' : sanitize(item)]));
}

@Injectable()
export class ReviewsLogger {
  public info(event: string, context: Readonly<Record<string, unknown>> = {}): void { process.stdout.write(`${JSON.stringify({ level: 'info', event, ...sanitize(context) as object })}\n`); }
  public error(event: string, context: Readonly<Record<string, unknown>> = {}): void { process.stderr.write(`${JSON.stringify({ level: 'error', event, ...sanitize(context) as object })}\n`); }
}
