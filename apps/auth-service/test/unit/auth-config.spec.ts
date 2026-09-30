import { loadAuthConfig } from '@auth/infrastructure/config/auth-config';
import { createAuthCryptoFixture } from '../helpers/crypto-fixture';

const fixture = createAuthCryptoFixture();

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    AUTH_PORT: '3001',
    AUTH_DATABASE_URL: fixture.config.databaseUrl,
    AUTH_REDIS_URL: fixture.config.redisUrl,
    AUTH_ARGON2_MEMORY_COST: '8192',
    AUTH_ARGON2_TIME_COST: '2',
    AUTH_ARGON2_PARALLELISM: '1',
    AUTH_JWT_ACTIVE_KID: fixture.accessKeys.kid,
    AUTH_JWT_PRIVATE_KEY: fixture.accessKeys.privateKey,
    AUTH_JWT_PUBLIC_KEYS_JSON: JSON.stringify({
      [fixture.accessKeys.kid]: fixture.accessKeys.publicKey,
    }),
    AUTH_JWT_ISSUER: fixture.config.accessJwt.issuer,
    AUTH_JWT_AUDIENCE: fixture.config.accessJwt.audience,
    AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON: JSON.stringify({
      [fixture.inboundKeys.kid]: fixture.inboundKeys.publicKey,
    }),
    AUTH_INBOUND_SERVICE_ISSUER: fixture.config.inboundServiceJwt.issuer,
    AUTH_INBOUND_SERVICE_AUDIENCE: fixture.config.inboundServiceJwt.audience,
    AUTH_INBOUND_SERVICE_SCOPE: fixture.config.inboundServiceJwt.scope,
    AUTH_OUTBOUND_SERVICE_PRIVATE_KEY: fixture.outboundKeys.privateKey,
    AUTH_OUTBOUND_SERVICE_KID: fixture.outboundKeys.kid,
    AUTH_OUTBOUND_SERVICE_ISSUER: fixture.config.outboundServiceJwt.issuer,
    AUTH_OUTBOUND_SERVICE_AUDIENCE: fixture.config.outboundServiceJwt.audience,
    AUTH_OUTBOUND_SERVICE_SCOPE: fixture.config.outboundServiceJwt.scope,
    AUTH_OUTBOUND_SERVICE_TTL_SECONDS: '60',
    USERS_SERVICE_URL: fixture.config.usersServiceUrl,
    AUTH_USERS_TIMEOUT_MS: '1000',
    AUTH_USERS_CIRCUIT_FAILURE_THRESHOLD: '5',
    AUTH_USERS_CIRCUIT_RESET_MS: '30000',
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '3600',
    AUTH_SESSION_ABSOLUTE_TTL_SECONDS: '604800',
    AUTH_REFRESH_TOKEN_HMAC_SECRET: fixture.config.refreshTokenHmacSecret,
    AUTH_REGISTRATION_FINGERPRINT_SECRET: fixture.config.registrationFingerprintSecret,
    AUTH_LOGIN_IDENTIFIER_HMAC_SECRET: fixture.config.loginIdentifierHmacSecret,
    OTEL_EXPORTER_OTLP_ENDPOINT: fixture.config.otlpEndpoint,
    OTEL_SERVICE_NAME: fixture.config.otelServiceName,
  };
}

describe('loadAuthConfig reconciler defaults (AUTH-043)', () => {
  it('applies documented defaults 30/900/50/5 when reconciler variables are absent', () => {
    const config = loadAuthConfig(baseEnvironment());

    expect(config.reconciler).toEqual({
      intervalSeconds: 30,
      ttlSeconds: 900,
      batchSize: 50,
      maxAttempts: 5,
    });
  });

  it('honours provided reconciler values', () => {
    const environment = {
      ...baseEnvironment(),
      AUTH_RECONCILER_INTERVAL_SECONDS: '60',
      AUTH_RECONCILER_TTL_SECONDS: '1200',
      AUTH_RECONCILER_BATCH_SIZE: '10',
      AUTH_RECONCILER_MAX_ATTEMPTS: '3',
    };

    const config = loadAuthConfig(environment);

    expect(config.reconciler).toEqual({
      intervalSeconds: 60,
      ttlSeconds: 1200,
      batchSize: 10,
      maxAttempts: 3,
    });
  });

  it('rejects an invalid reconciler value', () => {
    const environment = { ...baseEnvironment(), AUTH_RECONCILER_INTERVAL_SECONDS: '0' };

    expect(() => loadAuthConfig(environment)).toThrow(/AUTH_RECONCILER_INTERVAL_SECONDS/);
  });
});

describe('loadAuthConfig Argon2 bounds (AUTH-083)', () => {
  it('rejects AUTH_ARGON2_TIME_COST below the argon2 minimum of 2', () => {
    const environment = { ...baseEnvironment(), AUTH_ARGON2_TIME_COST: '1' };

    expect(() => loadAuthConfig(environment)).toThrow(/AUTH_ARGON2_TIME_COST/);
  });
});

describe('loadAuthConfig swagger server URL', () => {
  it('is optional and read verbatim when present', () => {
    expect(loadAuthConfig(baseEnvironment()).swaggerServerUrl).toBeUndefined();

    const config = loadAuthConfig({ ...baseEnvironment(), AUTH_SWAGGER_SERVER_URL: '/' });
    expect(config.swaggerServerUrl).toBe('/');

    const absolute = loadAuthConfig({
      ...baseEnvironment(),
      AUTH_SWAGGER_SERVER_URL: 'https://auth.example.test',
    });
    expect(absolute.swaggerServerUrl).toBe('https://auth.example.test');
  });
});
