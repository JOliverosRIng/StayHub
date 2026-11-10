import { generateKeyPairSync } from 'node:crypto';
import { loadPaymentsConfig } from '../../src/infrastructure/config/payments-config';

const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'pem' }).toString();

const validEnv: NodeJS.ProcessEnv = {
  PAYMENTS_PORT: '3006',
  PAYMENTS_DATABASE_URL: 'postgresql://payments:synthetic@localhost:5432/payments_db',
  PAYMENTS_JWT_ISSUER: 'https://auth.stayhub.internal',
  PAYMENTS_JWT_AUDIENCE: 'stayhub-api',
  PAYMENTS_JWT_KID: 'auth-v1',
  PAYMENTS_JWT_PUBLIC_KEY: publicKey,
  PAYMENTS_SERVICE_JWT_ISSUER: 'stayhub-bookings-service',
  PAYMENTS_SERVICE_JWT_AUDIENCE: 'stayhub-payments-service',
  PAYMENTS_SERVICE_JWT_KID: 'bookings-v1',
  PAYMENTS_SERVICE_JWT_PUBLIC_KEY: publicKey,
  PAYMENTS_CHARGE_SCOPE: 'payments:charge',
  PAYMENTS_REFUND_SCOPE: 'payments:refund',
  PAYMENTS_READ_SCOPE: 'payments:read',
  PAYMENTS_ALLOWED_CURRENCIES: 'COP,USD',
  PAYMENTS_MAX_AMOUNT_MINOR: '9000000000000',
  PAYMENTS_TOKEN_HMAC_SECRET: 'test-only-secret-with-at-least-32-characters',
};

describe('PAY-009 Payments configuration', () => {
  it('loads required settings and allows RabbitMQ to be absent', () => {
    const config = loadPaymentsConfig(validEnv);

    expect(config.port).toBe(3006);
    expect(config.databaseUrl).toContain('/payments_db');
    expect(config.allowedCurrencies).toEqual(['COP', 'USD']);
    expect(config.rabbitmqUrl).toBeUndefined();
  });

  it.each([
    'PAYMENTS_DATABASE_URL',
    'PAYMENTS_JWT_ISSUER',
    'PAYMENTS_JWT_AUDIENCE',
    'PAYMENTS_JWT_KID',
    'PAYMENTS_JWT_PUBLIC_KEY',
    'PAYMENTS_SERVICE_JWT_ISSUER',
    'PAYMENTS_SERVICE_JWT_AUDIENCE',
    'PAYMENTS_SERVICE_JWT_KID',
    'PAYMENTS_SERVICE_JWT_PUBLIC_KEY',
    'PAYMENTS_ALLOWED_CURRENCIES',
    'PAYMENTS_TOKEN_HMAC_SECRET',
  ])('requires %s', (key) => {
    expect(() => loadPaymentsConfig({ ...validEnv, [key]: '' })).toThrow();
  });

  it('rejects an HMAC secret shorter than 32 characters', () => {
    expect(() => loadPaymentsConfig({ ...validEnv, PAYMENTS_TOKEN_HMAC_SECRET: 'too-short' })).toThrow(/32/);
  });

  it.each([
    'postgresql://payments:secret@localhost:5432/auth_db',
    'http://payments:secret@localhost:5432/payments_db',
    'postgresql://localhost:5432/payments_db',
  ])('rejects a foreign or invalid database URL: %s', (databaseUrl) => {
    expect(() => loadPaymentsConfig({ ...validEnv, PAYMENTS_DATABASE_URL: databaseUrl })).toThrow();
  });

  it('rejects currencies outside the supported allowlist', () => {
    expect(() => loadPaymentsConfig({ ...validEnv, PAYMENTS_ALLOWED_CURRENCIES: 'COP,EUR' })).toThrow(/currency/i);
  });

  it('does not accept an amount limit above the safe maximum', () => {
    expect(() => loadPaymentsConfig({ ...validEnv, PAYMENTS_MAX_AMOUNT_MINOR: '9000000000001' })).toThrow();
  });
});
