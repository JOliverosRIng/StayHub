import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadReviewsConfig } from '@reviews/infrastructure/config/reviews-config';

const valid = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test', REVIEWS_PORT: '3007', REVIEWS_DATABASE_URL: 'postgresql://reviews:test@localhost:5432/reviews',
  REVIEWS_USER_JWT_PUBLIC_KEYS_JSON: '{"k":"pem"}', REVIEWS_USER_JWT_ISSUER: 'stayhub-auth', REVIEWS_USER_JWT_AUDIENCE: 'stayhub-api',
  REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON: '{"k":"pem"}', REVIEWS_GATEWAY_JWT_ISSUER: 'stayhub-gateway', REVIEWS_GATEWAY_JWT_AUDIENCE: 'stayhub-reviews-service', REVIEWS_GATEWAY_JWT_SCOPE: 'reviews:read',
  REVIEWS_BOOKINGS_BASE_URL: 'http://bookings-service:3005', REVIEWS_BOOKINGS_TIMEOUT_MS: '1500', REVIEWS_BOOKINGS_SERVICE_TOKEN: 'dev-token',
  REVIEWS_SHUTDOWN_GRACE_MS: '10000', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
});

describe('reviews configuration', () => {
  it('loads the complete typed configuration', () => { expect(loadReviewsConfig(valid())).toMatchObject({ port: 3007, bookingsTimeoutMs: 1500, bookingsBaseUrl: 'http://bookings-service:3005' }); });
  it('fixes the service port', () => { expect(() => loadReviewsConfig({ ...valid(), REVIEWS_PORT: '3008' })).toThrow('must be 3007'); });
  it('rejects missing secrets and malformed public keys', () => {
    const noDb = valid(); delete noDb.REVIEWS_DATABASE_URL; expect(() => loadReviewsConfig(noDb)).toThrow('REVIEWS_DATABASE_URL');
    expect(() => loadReviewsConfig({ ...valid(), REVIEWS_USER_JWT_PUBLIC_KEYS_JSON: '[]' })).toThrow('invalid');
  });
  it('accepts database secrets through _FILE', () => {
    const file = join(tmpdir(), `reviews-db-${process.pid}.txt`); writeFileSync(file, 'postgresql://reviews:test@localhost:5432/reviews');
    try { const env = valid(); delete env.REVIEWS_DATABASE_URL; env.REVIEWS_DATABASE_URL_FILE = file; expect(loadReviewsConfig(env).databaseUrl).toContain('postgresql://'); } finally { unlinkSync(file); }
  });
  it.each([['ftp://bookings', 'REVIEWS_BOOKINGS_BASE_URL'], ['0', 'REVIEWS_BOOKINGS_TIMEOUT_MS'], ['0', 'REVIEWS_SHUTDOWN_GRACE_MS'], ['file:///tmp/otel', 'OTEL_EXPORTER_OTLP_ENDPOINT']])('rejects invalid %s', (value, name) => {
    expect(() => loadReviewsConfig({ ...valid(), [name]: value })).toThrow();
  });
});
