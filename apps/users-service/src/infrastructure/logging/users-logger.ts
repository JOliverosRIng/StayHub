import type { LoggerService } from '@nestjs/common';
export type LogEvent = 'http_request' | 'startup' | 'shutdown' | 'framework' | 'dependency_unavailable';
export interface SafeLog { event: LogEvent; level: string; service: 'users-service'; traceId?: string; status?: number; durationMs?: number }
export class UsersLogger implements LoggerService {
  constructor(private readonly sink: (record: SafeLog) => void = (record) => { process.stdout.write(`${JSON.stringify(record)}\n`); }) {}
  event(event: LogEvent, data: { traceId?: string; status?: number; durationMs?: number } = {}): void {
    const record: SafeLog = { event, level: 'info', service: 'users-service' };
    if (data.traceId && /^[0-9a-f]{32}$/.test(data.traceId)) record.traceId = data.traceId;
    if (typeof data.status === 'number') record.status = data.status;
    if (typeof data.durationMs === 'number') record.durationMs = data.durationMs;
    this.sink(record);
  }
  log(): void { this.event('framework'); }
  error(): void { this.sink({ event: 'framework', level: 'error', service: 'users-service' }); }
  warn(): void { this.sink({ event: 'framework', level: 'warn', service: 'users-service' }); }
  debug(): void { /* Framework payloads are deliberately not serialized. */ }
  verbose(): void { /* Framework payloads are deliberately not serialized. */ }
}
