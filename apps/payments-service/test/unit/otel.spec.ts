import { NodeSDK } from '@opentelemetry/sdk-node';
import { observeDependency, startTelemetry, stopTelemetry } from '../../src/infrastructure/observability/otel';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';

const config = {
  otlpEndpoint: 'http://127.0.0.1:4318',
  otelServiceName: 'payments-test',
  gatewayTimeoutMs: 100,
} as PaymentsConfig;

describe('Payments OpenTelemetry', () => {
  it('does not make a collector outage fatal to application startup', () => {
    const start = jest.spyOn(NodeSDK.prototype, 'start').mockImplementation(() => { throw new Error('collector offline'); });
    expect(() => startTelemetry(config)).not.toThrow();
    expect(start).toHaveBeenCalledTimes(1);
    start.mockRestore();
  });

  it('initializes once and shuts down idempotently', async () => {
    const start = jest.spyOn(NodeSDK.prototype, 'start').mockImplementation(() => undefined);
    const shutdown = jest.spyOn(NodeSDK.prototype, 'shutdown').mockResolvedValue(undefined);
    startTelemetry(config);
    startTelemetry(config);
    expect(start).toHaveBeenCalledTimes(1);
    await stopTelemetry();
    await stopTelemetry();
    expect(shutdown).toHaveBeenCalledTimes(1);
    start.mockRestore();
    shutdown.mockRestore();
  });

  it('preserves dependency results and errors while wrapping them in safe spans', async () => {
    await expect(observeDependency('gateway', 'charge', () => Promise.resolve('approved'))).resolves.toBe('approved');
    await expect(observeDependency('postgresql', 'transaction', () => Promise.reject(new Error('query secret'))))
      .rejects.toThrow('query secret');
  });
});
