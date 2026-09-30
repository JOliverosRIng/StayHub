import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';

import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

const LOGGER_NAME = 'stayhub-api-gateway';

let telemetry: NodeSDK | null = null;

export function startTelemetry(config: GatewayConfig): void {
  if (telemetry !== null) return;
  telemetry = new NodeSDK({
    serviceName: config.otelServiceName,
    traceExporter: new OTLPTraceExporter({ url: otlpTracesUrl(config.otlpEndpoint) }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: otlpLogsUrl(config.otlpEndpoint) }),
      ),
    ],
  });
  telemetry.start();
}

export function stopTelemetry(): Promise<void> {
  const active = telemetry;
  telemetry = null;
  return active === null ? Promise.resolve() : active.shutdown();
}

export function telemetryStarted(): boolean {
  return telemetry !== null;
}

export function otlpTracesUrl(otlpEndpoint: string): string {
  return `${withoutTrailingSlash(otlpEndpoint)}/v1/traces`;
}

export function otlpLogsUrl(otlpEndpoint: string): string {
  return `${withoutTrailingSlash(otlpEndpoint)}/v1/logs`;
}

export function emitTelemetryLog(level: string, body: string): void {
  logs.getLogger(LOGGER_NAME).emit({
    severityText: level.toUpperCase(),
    severityNumber: severity(level),
    body,
  });
}

function withoutTrailingSlash(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

function severity(level: string): SeverityNumber {
  if (level === 'error') return SeverityNumber.ERROR;
  if (level === 'warn') return SeverityNumber.WARN;
  if (level === 'debug') return SeverityNumber.DEBUG;
  if (level === 'trace') return SeverityNumber.TRACE;
  return SeverityNumber.INFO;
}
