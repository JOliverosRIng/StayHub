import type { LoggerService } from '@nestjs/common';

export type PaymentsLogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal';
export type PaymentsLogEvent = string;
export type PaymentsLogRecord = Readonly<Record<string, unknown>> & {
  readonly level: PaymentsLogLevel;
  readonly service: 'payments-service';
};

type LogSink = (record: PaymentsLogRecord) => void;

const SENSITIVE_KEYS = new Set(['token', 'paymentmethod', 'authorization', 'idempotencykey']);
const PAN_PATTERN = /(?<!\d)\d{13,19}(?!\d)/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const PAYMENT_TOKEN_PATTERN = /\btok_[A-Za-z0-9_-]{4,}\b/g;

function sanitizeString(value: string): string {
  return value
    .replace(PAN_PATTERN, '[REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(PAYMENT_TOKEN_PATTERN, '[REDACTED]');
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sanitize(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number') {
    const digits = Number.isInteger(value) ? String(Math.abs(value)) : '';
    return digits.length >= 13 && digits.length <= 19 ? '[REDACTED]' : value;
  }
  if (typeof value === 'bigint') return sanitizeString(value.toString());
  if (value === null || typeof value === 'boolean' || value === undefined) return value;
  if (typeof value !== 'object') return `[${typeof value}]`;
  if (ancestors.has(value)) return '[Circular]';

  ancestors.add(value);
  try {
    if (value instanceof Error) {
      return { name: sanitizeString(value.name), message: sanitizeString(value.message) };
    }
    if (Array.isArray(value)) return value.map((entry) => sanitize(entry, ancestors));

    const safe: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      safe[key] = SENSITIVE_KEYS.has(normalizedKey(key)) ? '[REDACTED]' : sanitize(entry, ancestors);
    }
    return safe;
  } catch {
    return '[Unserializable]';
  } finally {
    ancestors.delete(value);
  }
}

function safeRecord(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return sanitize(data, new WeakSet<object>()) as Record<string, unknown>;
}

export class PaymentsLogger implements LoggerService {
  constructor(
    private readonly sink: LogSink = (record) => {
      process.stdout.write(`${JSON.stringify(record)}\n`);
    },
  ) {}

  event(event: PaymentsLogEvent, data: Readonly<Record<string, unknown>> = {}): void {
    this.write('info', { ...safeRecord(data), event, level: 'info', service: 'payments-service' });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.framework('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.framework('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.framework('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.framework('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.framework('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.framework('fatal', message, optionalParams);
  }

  private framework(level: PaymentsLogLevel, message: unknown, optionalParams: readonly unknown[]): void {
    const context = [...optionalParams].reverse().find((parameter) => typeof parameter === 'string');
    this.write(level, {
      context: typeof context === 'string' ? sanitizeString(context) : undefined,
      event: 'framework',
      level,
      message: sanitize(message, new WeakSet<object>()),
      service: 'payments-service',
    });
  }

  private write(level: PaymentsLogLevel, record: PaymentsLogRecord): void {
    this.sink({ ...record, level, service: 'payments-service' });
  }
}
