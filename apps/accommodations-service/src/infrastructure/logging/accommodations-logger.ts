import type { LoggerService } from '@nestjs/common';
export type LogEvent = 'http_request' | 'framework' | 'dependency_unavailable';
export interface SafeLog {
  event: LogEvent; level: string; service: 'accommodations-service'; traceId?: string; status?: number; durationMs?: number;
  operation?: 'photo.store' | 'photo.compensate'; errorCode?: string;
}
export class AccommodationsLogger implements LoggerService {
  constructor(private readonly sink: (record: SafeLog) => void = (record) => { process.stdout.write(`${JSON.stringify(record)}\n`); }) {}
  event(event: LogEvent, data: { traceId?: string; status?: number; durationMs?: number } = {}): void {
    const record: SafeLog = { event, level: 'info', service: 'accommodations-service' };
    if (data.traceId && /^[0-9a-f]{32}$/.test(data.traceId)) record.traceId = data.traceId;
    if (typeof data.status === 'number') record.status = data.status;
    if (typeof data.durationMs === 'number') record.durationMs = data.durationMs;
    this.sink(record);
  }
  dependencyFailure(operation: 'photo.store' | 'photo.compensate', code: unknown): void {
    this.sink({ event: 'dependency_unavailable', level: 'error', service: 'accommodations-service', operation,
      errorCode: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,20}$/.test(code) ? code : 'UNKNOWN' });
  }
  log(): void { this.event('framework'); }
  error(): void { this.sink({ event: 'framework', level: 'error', service: 'accommodations-service' }); }
  warn(): void { this.sink({ event: 'framework', level: 'warn', service: 'accommodations-service' }); }
  debug(): void { /* Framework payloads are deliberately not serialized. */ }
  verbose(): void { /* Framework payloads are deliberately not serialized. */ }
}
