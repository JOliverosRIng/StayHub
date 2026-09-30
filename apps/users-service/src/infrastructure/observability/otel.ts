import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { UsersLogger } from '../logging/users-logger';
export function createTelemetry(endpoint: string): { logger: UsersLogger; shutdown: () => Promise<void> } {
  const provider = new LoggerProvider({ resource: new Resource({ 'service.name': 'users-service' }) });
  provider.addLogRecordProcessor(new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/logs`, timeoutMillis: 2000 })));
  const otel = provider.getLogger('users-service');
  return {
    logger: new UsersLogger((record) => {
      process.stdout.write(`${JSON.stringify(record)}\n`);
      otel.emit({ body: record.event, attributes: { ...record } });
    }),
    shutdown: () => provider.shutdown(),
  };
}
