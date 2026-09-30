export interface StartupFailureRecord {
  readonly level: 'fatal';
  readonly service: string;
  readonly code: 'STARTUP_FAILED';
  readonly kind: 'error' | 'unknown';
}

export function startupFailureRecord(error: unknown): StartupFailureRecord {
  return {
    level: 'fatal',
    service: 'auth-service',
    code: 'STARTUP_FAILED',
    kind: error instanceof Error ? 'error' : 'unknown',
  };
}
