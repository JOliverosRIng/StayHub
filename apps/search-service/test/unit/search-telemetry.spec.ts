import { metrics, trace, context, propagation } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { InMemoryMetricExporter, PeriodicExportingMetricReader, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { observeConsumer, observeDependency, observeUseCase, recordHttpDuration, recordCacheOperation, searchTracer, startTelemetry, stopTelemetry } from '../../src/infrastructure/observability/otel';
import { recordEventLag, recordProjectionOutcome, recordResultCount } from '../../src/infrastructure/observability/search-metrics';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';

describe('Search telemetry', () => {
  afterEach(() => { trace.disable(); metrics.disable(); context.disable(); propagation.disable(); });
  it('exports correlated dependency spans and metrics without query terms or raw errors', async () => {
    const spans = new InMemorySpanExporter();
    const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 60_000 });
    const sdk = new NodeSDK({ spanProcessors: [new SimpleSpanProcessor(spans)], metricReader: reader, instrumentations: [] });
    sdk.start();
    try {
      await searchTracer.startActiveSpan('projection.consume', async (root) => {
        try {
          await observeConsumer('projection', () => observeUseCase('projection-upsert', () => observeDependency('postgresql', 'transaction', () => Promise.resolve())));
          await expect(observeDependency('redis', 'get', () => Promise.reject(new Error('secret query token')))).rejects.toThrow();
          await expect(observeDependency('postgresql', 'search', () => Promise.reject(new Error('query timeout')))).rejects.toThrow();
          recordCacheOperation('error'); recordHttpDuration(4, { route: '/internal/v1/search', status: 200 });
          recordResultCount('search', 2); recordEventLag(new Date().toISOString()); recordProjectionOutcome('duplicate'); recordProjectionOutcome('stale'); recordProjectionOutcome('dlq');
        } finally { root.end(); }
      });
      await reader.forceFlush();
      const exported = spans.getFinishedSpans();
      expect(exported.map((span) => span.name)).toEqual(expect.arrayContaining(['consumer.projection', 'usecase.projection-upsert', 'postgresql.transaction', 'redis.get', 'projection.consume']));
      expect(new Set(exported.map((span) => span.spanContext().traceId)).size).toBe(1);
      expect(exported.find((span) => span.name === 'redis.get')?.status.code).toBe(2);
      expect(JSON.stringify(exported.map((span) => ({ attributes: span.attributes, events: span.events })))).not.toContain('secret');
      const metricNames = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics.map((metric) => metric.descriptor.name)));
      expect(metricNames).toEqual(expect.arrayContaining([
        'search.http.duration', 'search.dependency.duration', 'search.cache.operations', 'search.results.count',
        'search.query.timeouts', 'search.projection.event_lag', 'search.projection.outcomes',
      ]));
    } finally { await sdk.shutdown(); }
  });
  it('starts the configured OTLP SDK once and shuts it down once', async () => {
    const start = jest.spyOn(NodeSDK.prototype, 'start').mockImplementation(() => undefined);
    const stop = jest.spyOn(NodeSDK.prototype, 'shutdown').mockResolvedValue(undefined);
    const config = { otlpEndpoint: 'http://collector:4318/', dependencyTimeoutMs: 100, otelServiceName: 'search-test' } as SearchConfig;
    startTelemetry(config); startTelemetry(config);
    expect(start).toHaveBeenCalledTimes(1);
    await stopTelemetry(); await stopTelemetry();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
