import { metrics, type Attributes, type Meter } from '@opentelemetry/api';

const meter = (): Meter => metrics.getMeter('stayhub-search-service');

export function recordHttpDuration(durationMs: number, attributes: Attributes): void {
  meter().createHistogram('search.http.duration', { unit: 'ms' }).record(durationMs, attributes);
}

export function recordResultCount(operation: 'search' | 'suggest', count: number): void {
  meter().createHistogram('search.results.count', { unit: '{result}' }).record(count, { operation });
}

export function recordCacheOperation(outcome: 'hit' | 'miss' | 'error'): void {
  meter().createCounter('search.cache.operations').add(1, { outcome });
}

export function recordQueryTimeout(operation: string): void {
  meter().createCounter('search.query.timeouts').add(1, { operation });
}

export function recordEventLag(occurredAt: string): void {
  const lagMs = Math.max(0, Date.now() - Date.parse(occurredAt));
  if (Number.isFinite(lagMs)) meter().createHistogram('search.projection.event_lag', { unit: 'ms' }).record(lagMs);
}

export function recordProjectionOutcome(outcome: 'applied' | 'removed' | 'duplicate' | 'stale' | 'dlq' | 'invalid'): void {
  meter().createCounter('search.projection.outcomes').add(1, { outcome });
}
