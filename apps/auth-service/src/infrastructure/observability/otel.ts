import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';

import type { AuthConfig } from '@auth/infrastructure/config/auth-config';

let telemetry: NodeSDK | null = null;

export function startTelemetry(config: AuthConfig): void {
  if (telemetry !== null) return;
  telemetry = new NodeSDK({
    serviceName: config.otelServiceName,
    traceExporter: new OTLPTraceExporter({ url: `${config.otlpEndpoint.replace(/\/$/, '')}/v1/traces` }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: `${config.otlpEndpoint.replace(/\/$/, '')}/v1/logs` }),
      ),
    ],
  });
  telemetry.start();
}

export function emitTelemetryLog(level: string, body: string): void {
  logs.getLogger('stayhub-auth-service').emit({
    severityText: level.toUpperCase(),
    severityNumber: severity(level),
    body,
  });
}

export async function stopTelemetry(): Promise<void> {
  const active = telemetry;
  telemetry = null;
  if (active !== null) await active.shutdown();
}

function severity(level: string): SeverityNumber {
  if (level === 'error') return SeverityNumber.ERROR;
  if (level === 'warn') return SeverityNumber.WARN;
  if (level === 'debug') return SeverityNumber.DEBUG;
  if (level === 'trace') return SeverityNumber.TRACE;
  return SeverityNumber.INFO;
}
