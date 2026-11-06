import { Injectable, LoggerService } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

function safe(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [/authorization|token|password|secret|email|phone/iu.test(key) ? [key, '[REDACTED]'] : [key, item]]));
}
@Injectable()
export class BookingsLogger implements LoggerService {
  public log(message: unknown, context?: string): void { this.write('info', message, context); }
  public error(message: unknown, trace?: string, context?: string): void { this.write('error', message, context, trace); }
  public warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  private write(level: string, message: unknown, context?: string, errorTrace?: string): void { process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, context, message: safe(message), traceId: trace.getActiveSpan()?.spanContext().traceId, ...(errorTrace ? { errorTrace: '[REDACTED]' } : {}) })}\n`); }
}
