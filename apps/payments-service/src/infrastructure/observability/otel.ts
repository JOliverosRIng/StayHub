import { context, SpanKind, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { PaymentsConfig } from '../config/payments-config';

export const paymentsTracer = trace.getTracer('stayhub-payments-service');
const EXPORT_TIMEOUT_MS = 5_000;
let telemetry: NodeSDK | undefined;

export function startTelemetry(config: PaymentsConfig): void {
  if (telemetry) return;
  const endpoint = config.otlpEndpoint.replace(/\/$/u, '');
  const sdk = new NodeSDK({
    serviceName: config.otelServiceName,
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      timeoutMillis: EXPORT_TIMEOUT_MS,
    }),
    // Explicit spans avoid capturing SQL, URLs, payment tokens, or request bodies.
    instrumentations: [],
  });
  try {
    sdk.start();
    telemetry = sdk;
  } catch {
    void sdk.shutdown().catch(() => undefined);
  }
}

export async function stopTelemetry(): Promise<void> {
  const sdk = telemetry;
  telemetry = undefined;
  try {
    await sdk?.shutdown();
  } catch {
    // Telemetry exporter failure must not interrupt application shutdown.
  }
}

export async function observeDependency<T>(
  system: 'postgresql' | 'gateway',
  operation: string,
  action: () => Promise<T>,
): Promise<T> {
  const attributes: Attributes = { 'dependency.system': system, 'dependency.operation': operation };
  return paymentsTracer.startActiveSpan(
    `${system}.${operation}`,
    { kind: SpanKind.CLIENT, attributes },
    context.active(),
    async (span) => {
      try {
        return await action();
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
