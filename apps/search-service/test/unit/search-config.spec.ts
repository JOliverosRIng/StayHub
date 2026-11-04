import { loadSearchConfig } from '../../src/infrastructure/config/search-config';
const environment = {
  SEARCH_DATABASE_URL: 'postgresql://test:test@localhost/test', SEARCH_REDIS_URL: 'redis://localhost:6379', SEARCH_RABBITMQ_URL: 'amqp://localhost',
  SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ test: '-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----' }),
  SEARCH_SERVICE_JWT_ISSUER: 'test', SEARCH_SERVICE_JWT_AUDIENCE: 'search', SEARCH_SERVICE_JWT_SCOPE: 'search:invoke',
};
describe('Search telemetry configuration', () => {
  it('loads and validates the OTLP endpoint and log level', () => {
    const config = loadSearchConfig({ ...environment, OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector:4318', SEARCH_LOG_LEVEL: 'debug' });
    expect(config.otlpEndpoint).toBe('https://collector:4318'); expect(config.logLevel).toBe('debug');
  });
  it.each(['redis://collector', 'http://user:secret@collector', 'http://collector?token=secret', 'http://collector#fragment'])('rejects an unsafe OTLP endpoint %s', (endpoint) => {
    expect(() => loadSearchConfig({ ...environment, OTEL_EXPORTER_OTLP_ENDPOINT: endpoint })).toThrow();
  });
  it('rejects an unknown log level', () => { expect(() => loadSearchConfig({ ...environment, SEARCH_LOG_LEVEL: 'everything' })).toThrow('SEARCH_LOG_LEVEL'); });
});
