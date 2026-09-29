import {
  emitTelemetryLog,
  otlpTracesUrl,
  otlpLogsUrl,
  startTelemetry,
  stopTelemetry,
  telemetryStarted,
} from '@gateway/infrastructure/observability/otel';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

describe('otel (GW-012)', () => {
  afterEach(async () => {
    await stopTelemetry();
  });

  it('deriva las URLs OTLP anadiendo el sufijo a un endpoint con barra final', () => {
    const config = createTestGatewayConfig({
      GATEWAY_OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318/',
    }).config;

    expect(otlpTracesUrl(config.otlpEndpoint)).toBe('http://otel-collector:4318/v1/traces');
    expect(otlpLogsUrl(config.otlpEndpoint)).toBe('http://otel-collector:4318/v1/logs');
  });

  it('no duplica la barra al derivar las URLs OTLP', () => {
    expect(otlpTracesUrl('http://otel:4318')).toBe('http://otel:4318/v1/traces');
  });

  it('arranca la telemetria una sola vez aunque se llame dos veces', () => {
    const { config } = createTestGatewayConfig();

    startTelemetry(config);
    startTelemetry(config);

    expect(telemetryStarted()).toBe(true);
  });

  it('permite reiniciar la telemetria tras detenerla', () => {
    const { config } = createTestGatewayConfig();

    startTelemetry(config);
    expect(telemetryStarted()).toBe(true);

    return stopTelemetry().then(() => {
      expect(telemetryStarted()).toBe(false);
      startTelemetry(config);
      expect(telemetryStarted()).toBe(true);
    });
  });

  it('detener sin haber arrancado no lanza', async () => {
    await expect(stopTelemetry()).resolves.toBeUndefined();
    expect(telemetryStarted()).toBe(false);
  });

  it('emitir un log de telemetria no lanza cuando el SDK esta detenido', () => {
    expect(() => emitTelemetryLog('info', '{"message":"hola"}')).not.toThrow();
  });

  it('acepta todos los niveles usados por el logger', () => {
    for (const level of ['error', 'warn', 'info', 'debug', 'trace', 'desconocido']) {
      expect(() => emitTelemetryLog(level, '{"message":"hola"}')).not.toThrow();
    }
  });
});
