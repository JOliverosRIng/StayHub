import { Injectable, LoggerService } from '@nestjs/common';

import { emitTelemetryLog } from './otel';

const REDACTED_KEYS = /password|hash|token|authorization|cookie|email/i;

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
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'auth-service',
      message: sanitize(message),
      ...(context === undefined ? {} : { context: sanitize(context) }),
    });
    emitTelemetryLog(level, record);
    if (level === 'error') process.stderr.write(`${record}\n`);
    else process.stdout.write(`${record}\n`);
  }
}

function sanitize(value: unknown, key = ''): unknown {
  if (REDACTED_KEYS.test(key)) return '[REDACTED]';
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
  }
  if (typeof value === 'string' && /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) return '[REDACTED]';
  return value;
}
