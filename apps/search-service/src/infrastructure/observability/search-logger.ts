import { Injectable, type LoggerService } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

const sensitiveKey = /token|authorization|password|secret|url|query|^q$|term|payload|cookie|email|stack/iu;
const levels = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof levels;

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value
    .replace(/Bearer\s+\S+/giu, '[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, '[REDACTED]')
    .replace(/(?:https?|postgres(?:ql)?|rediss?|amqps?):\/\/[^\s]+/giu, '[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[REDACTED]');
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return '[REDACTED_ERROR]';
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((item: unknown) => sanitize(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : sanitize(item, seen)]));
  }
  return value;
}

@Injectable()
export class SearchLogger implements LoggerService {
  private level: Level = 'info';
  public setLevel(level: Level): void { this.level = level; }
  public log(message: unknown, ...context: unknown[]): void { this.emit('info', message, context); }
  public info(message: string, context: Readonly<Record<string, unknown>> = {}): void { this.emit('info', message, [context]); }
  public warn(message: unknown, ...context: unknown[]): void { this.emit('warn', message, context); }
  public error(message: unknown, ...context: unknown[]): void { this.emit('error', message, context); }
  public debug(message: unknown, ...context: unknown[]): void { this.emit('debug', message, context); }
  public verbose(message: unknown, ...context: unknown[]): void { this.emit('debug', message, context); }
  public fatal(message: unknown, ...context: unknown[]): void { this.emit('error', message, context); }
  private emit(level: Level, message: unknown, context: unknown[]): void {
    if (levels[level] > levels[this.level]) return;
    const record = { timestamp: new Date().toISOString(), level, message: sanitize(message), context: sanitize(context), traceId: trace.getActiveSpan()?.spanContext().traceId };
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
}
