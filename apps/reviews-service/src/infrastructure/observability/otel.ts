import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let sdk: NodeSDK | undefined;
export function startTelemetry(endpoint: string): void {
  if (sdk) return;
  sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/u, '')}/v1/traces` }) });
  sdk.start();
}
export async function stopTelemetry(): Promise<void> { const active = sdk; sdk = undefined; if (active) await active.shutdown(); }
