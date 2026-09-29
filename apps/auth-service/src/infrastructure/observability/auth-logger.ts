import { Injectable, LoggerService } from '@nestjs/common';

import { emitTelemetryLog } from './otel';

const SENSITIVE_KEY = /password|passwd|secret|hash|token|authorization|cookie|email|credential/i;
const EMAIL_VALUE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const JWT_VALUE = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;

const ALLOWED_CONTEXT_KEYS = new Set([
  'code',
  'status',
  'traceId',
  'dependency',
  'event',
  'reason',
  'attempt',
  'kind',
  'service',
  'environment',
  'outcome',
  'name',
]);

@Injectable()
export class AuthLogger implements LoggerService {
  public log(message: unknown, context?: unknown): void {
    this.write('info', message, context);
  }

  public error(message: unknown, ...optional: unknown[]): void {
    this.write('error', message, optional);
  }

  public warn(message: unknown, context?: unknown): void {
    this.write('warn', message, context);
  }

  public debug(message: unknown, context?: unknown): void {
    this.write('debug', message, context);
  }

  public verbose(message: unknown, context?: unknown): void {
    this.write('trace', message, context);
  }

  private write(level: string, message: unknown, context?: unknown): void {
    const normalizedContext = normalizeContext(context);
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'auth-service',
      message: sanitizeMessage(message),
      ...(normalizedContext === undefined ? {} : { context: sanitize(normalizedContext) }),
    });
    emitTelemetryLog(level, record);
    if (level === 'error') process.stderr.write(`${record}\n`);
    else process.stdout.write(`${record}\n`);
  }
}

function normalizeContext(context: unknown): unknown {
  if (context === undefined) return undefined;
  if (Array.isArray(context)) {
    const defined = context.filter((item) => item !== undefined);
    if (defined.length === 0) return undefined;
    return defined.length === 1 ? defined[0] : defined;
  }
  return context;
}

function sanitizeMessage(message: unknown): unknown {
  if (message instanceof Error) return describeError(message);
  if (typeof message === 'string') return redactValue(message);
  if (typeof message === 'number' || typeof message === 'boolean') return message;
  return sanitize(message);
}

function sanitize(value: unknown, key = ''): unknown {
  if (key !== '' && SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value instanceof Error) return describeError(value);
  if (Array.isArray(value)) return { count: value.length };
  if (typeof value === 'object' && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(childKey)) {
        output[childKey] = '[REDACTED]';
        continue;
      }
      if (!ALLOWED_CONTEXT_KEYS.has(childKey)) continue;
      output[childKey] = sanitize(child, childKey);
    }
    return output;
  }
  if (typeof value === 'string') return redactValue(value);
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    return 'unsupported';
  }
  return value;
}

function describeError(error: Error): { readonly name: string; readonly kind: 'error' } {
  const name = SAFE_NAME.test(error.name) ? error.name : 'Error';
  return { name, kind: 'error' };
}

function redactValue(value: string): string {
  return value.replace(JWT_VALUE, '[REDACTED]').replace(EMAIL_VALUE, '[REDACTED]');
}
