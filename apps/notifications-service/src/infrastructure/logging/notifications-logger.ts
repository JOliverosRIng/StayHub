import type { LoggerService } from '@nestjs/common';

const SECRET_KEY = /body|email|token|authorization|password|secret|private.?key|idempotency|fingerprint/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1),
  ]));
}

export class NotificationsLogger implements LoggerService {
  log(message: unknown, context?: string): void { this.write('info', message, context); }
  error(message: unknown, _trace?: string, context?: string): void { this.write('error', message, context); }
  warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  verbose(message: unknown, context?: string): void { this.write('debug', message, context); }

  private write(level: string, message: unknown, context?: string): void {
    const safe = typeof message === 'string' ? message : redact(message);
    process.stdout.write(`${JSON.stringify({ level, service: 'notifications-service', ...(context ? { context } : {}), message: safe })}\n`);
  }
}

export { redact };
