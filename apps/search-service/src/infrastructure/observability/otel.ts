import { context, metrics, SpanKind, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import type { SearchConfig } from '../config/search-config';
import { recordQueryTimeout } from './search-metrics';

export { recordCacheOperation, recordHttpDuration } from './search-metrics';

export const searchTracer = trace.getTracer('stayhub-search-service');
// Resolve meters at recording time: instruments created before SDK registration are no-ops.
let telemetry: NodeSDK | undefined;

export function startTelemetry(config: SearchConfig): void {
  if (telemetry) return;
  const endpoint = config.otlpEndpoint.replace(/\/$/u, '');
  const sdk = new NodeSDK({
    serviceName: config.otelServiceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, timeoutMillis: config.dependencyTimeoutMs }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, timeoutMillis: config.dependencyTimeoutMs }),
      exportIntervalMillis: 30_000,
    }),
    // Instrument explicitly: automatic SQL/HTTP instrumentation can record terms and URLs.
    instrumentations: [],
  });
  sdk.start();
  telemetry = sdk;
}

export async function stopTelemetry(): Promise<void> {
  const sdk = telemetry;
  telemetry = undefined;
  await sdk?.shutdown();
}

/** Attributes contain operation names only, never SQL, URLs, terms, or event payloads. */
export async function observeDependency<T>(system: 'postgresql' | 'redis' | 'rabbitmq', operation: string, action: () => Promise<T>): Promise<T> {
  const attributes: Attributes = { 'dependency.system': system, 'dependency.operation': operation };
  return searchTracer.startActiveSpan(`${system}.${operation}`, { kind: SpanKind.CLIENT, attributes }, context.active(), async (span) => {
    const started = performance.now();
    let outcome = 'ok';
    try { return await action(); }
    catch (error) {
      outcome = 'error';
      span.setStatus({ code: SpanStatusCode.ERROR });
      if (system === 'postgresql' && /timeout|timed out|P2028/iu.test(error instanceof Error ? `${error.name} ${error.message}` : String(error))) recordQueryTimeout(operation);
      throw error;
    }
    finally { metrics.getMeter('stayhub-search-service').createHistogram('search.dependency.duration', { unit: 'ms' }).record(performance.now() - started, { ...attributes, outcome }); span.end(); }
  });
}

export async function observeUseCase<T>(operation: string, action: () => Promise<T>): Promise<T> {
  return searchTracer.startActiveSpan(`usecase.${operation}`, { kind: SpanKind.INTERNAL, attributes: { 'application.operation': operation } }, context.active(), async (span) => {
    try { return await action(); }
    catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
    finally { span.end(); }
  });
}

export async function observeConsumer<T>(operation: string, action: () => Promise<T>): Promise<T> {
  return searchTracer.startActiveSpan(`consumer.${operation}`, { kind: SpanKind.CONSUMER, attributes: { 'messaging.system': 'rabbitmq', 'messaging.operation': operation } }, context.active(), async (span) => {
    try { return await action(); }
    catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
    finally { span.end(); }
  });
}
