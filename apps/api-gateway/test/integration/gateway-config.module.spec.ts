import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';

import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

const REQUIRED_NAMES = [
  'GATEWAY_PORT',
  'GATEWAY_API_PREFIX',
  'GATEWAY_TLS_CERT_FILE',
  'GATEWAY_TLS_KEY_FILE',
  'GATEWAY_AUTH_BASE_URL',
  'GATEWAY_USERS_BASE_URL',
  'GATEWAY_JWT_PUBLIC_KEYS_JSON',
  'GATEWAY_JWT_ISSUER',
  'GATEWAY_JWT_AUDIENCE',
  'GATEWAY_SERVICE_KID',
  'GATEWAY_SERVICE_PRIVATE_KEY_FILE',
  'GATEWAY_SERVICE_ISSUER',
  'GATEWAY_SERVICE_AUDIENCE',
  'GATEWAY_SERVICE_SCOPE',
  'GATEWAY_SERVICE_TTL_SECONDS',
  'GATEWAY_REDIS_URL',
  'GATEWAY_REDIS_PASSWORD_FILE',
  'GATEWAY_REDIS_NAMESPACE',
  'GATEWAY_TRUSTED_PROXY_CIDRS',
  'GATEWAY_REGISTER_RATE_LIMIT',
  'GATEWAY_REGISTER_RATE_WINDOW_SECONDS',
  'GATEWAY_LOGIN_RATE_LIMIT',
  'GATEWAY_LOGIN_RATE_WINDOW_SECONDS',
  'GATEWAY_MAX_PHOTO_BYTES',
  'GATEWAY_AUTH_TIMEOUT_MS',
  'GATEWAY_AUTH_CIRCUIT_FAILURE_THRESHOLD',
  'GATEWAY_AUTH_CIRCUIT_RESET_MS',
  'GATEWAY_USERS_TIMEOUT_MS',
  'GATEWAY_USERS_CIRCUIT_FAILURE_THRESHOLD',
  'GATEWAY_USERS_CIRCUIT_RESET_MS',
  'GATEWAY_INTROSPECTION_TIMEOUT_MS',
  'GATEWAY_OTEL_EXPORTER_OTLP_ENDPOINT',
  'GATEWAY_OTEL_SERVICE_NAME',
] as const;

let directory: string;
let environment: NodeJS.ProcessEnv;

function secretPath(name: string): string {
  return join(directory, name);
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'gateway-config-'));
  writeFileSync(secretPath('tls.crt'), '-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----');
  writeFileSync(secretPath('tls.key'), '-----BEGIN PRIVATE KEY-----\ntls\n-----END PRIVATE KEY-----');
  writeFileSync(
    secretPath('service.pem'),
    '-----BEGIN PRIVATE KEY-----\\nservice\\n-----END PRIVATE KEY-----',
  );
  writeFileSync(secretPath('redis.pass'), 'redis-password-long-enough');

  environment = {
    GATEWAY_PORT: '8080',
    GATEWAY_API_PREFIX: '/api/v1',
    GATEWAY_TLS_CERT_FILE: secretPath('tls.crt'),
    GATEWAY_TLS_KEY_FILE: secretPath('tls.key'),
    GATEWAY_TLS_MIN_VERSION: 'TLSv1.3',
    GATEWAY_AUTH_BASE_URL: 'http://auth-service:3001',
    GATEWAY_USERS_BASE_URL: 'http://users-service:3002',
    GATEWAY_JWT_PUBLIC_KEYS_JSON:
      '{"stayhub-auth-2026-01":"-----BEGIN PUBLIC KEY-----\\npublic\\n-----END PUBLIC KEY-----"}',
    GATEWAY_JWT_ISSUER: 'https://auth.stayhub.internal',
    GATEWAY_JWT_AUDIENCE: 'stayhub-api',
    GATEWAY_SERVICE_KID: 'gateway-2026-01',
    GATEWAY_SERVICE_PRIVATE_KEY_FILE: secretPath('service.pem'),
    GATEWAY_SERVICE_ISSUER: 'stayhub-api-gateway',
    GATEWAY_SERVICE_AUDIENCE: 'stayhub-auth-service',
    GATEWAY_SERVICE_SCOPE: 'auth:invoke',
    GATEWAY_SERVICE_TTL_SECONDS: '60',
    GATEWAY_REDIS_URL: 'redis://:change-me@gateway-redis:6379/0',
    GATEWAY_REDIS_PASSWORD_FILE: secretPath('redis.pass'),
    GATEWAY_REDIS_NAMESPACE: 'gateway:edge',
    GATEWAY_TRUSTED_PROXY_CIDRS: '10.0.0.0/8,172.16.0.0/12',
    GATEWAY_REGISTER_RATE_LIMIT: '10',
    GATEWAY_REGISTER_RATE_WINDOW_SECONDS: '600',
    GATEWAY_LOGIN_RATE_LIMIT: '30',
    GATEWAY_LOGIN_RATE_WINDOW_SECONDS: '300',
    GATEWAY_MAX_PHOTO_BYTES: '5000000',
    GATEWAY_AUTH_TIMEOUT_MS: '3000',
    GATEWAY_AUTH_CIRCUIT_FAILURE_THRESHOLD: '5',
    GATEWAY_AUTH_CIRCUIT_RESET_MS: '30000',
    GATEWAY_USERS_TIMEOUT_MS: '5000',
    GATEWAY_USERS_CIRCUIT_FAILURE_THRESHOLD: '5',
    GATEWAY_USERS_CIRCUIT_RESET_MS: '30000',
    GATEWAY_INTROSPECTION_TIMEOUT_MS: '2000',
    GATEWAY_OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
    GATEWAY_OTEL_SERVICE_NAME: 'stayhub-api-gateway',
  };
});

afterAll(() => {
  for (const name of REQUIRED_NAMES) {
    delete process.env[name];
  }
  rmSync(directory, { force: true, recursive: true });
});

function apply(): void {
  for (const name of REQUIRED_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, environment);
}

describe('GatewayConfigModule fail-fast (GW-009)', () => {
  it('resolves the typed config and reads secret files from disk', async () => {
    apply();
    const module = await Test.createTestingModule({ imports: [GatewayConfigModule] }).compile();
    const config = module.get<GatewayConfig>(GATEWAY_CONFIG);
    expect(config.tls.minVersion).toBe('TLSv1.3');
    expect(config.serviceJwt.privateKey).toBe(
      '-----BEGIN PRIVATE KEY-----\nservice\n-----END PRIVATE KEY-----',
    );
    expect(config.redis.password).toBe('redis-password-long-enough');
    await module.close();
  });

  it.each(REQUIRED_NAMES)('refuses to bootstrap when %s is absent', async (name) => {
    apply();
    delete process.env[name];
    await expect(
      Test.createTestingModule({ imports: [GatewayConfigModule] }).compile(),
    ).rejects.toThrow(new RegExp(name));
  });

  it('refuses to bootstrap when a secret file is missing on disk', async () => {
    apply();
    process.env['GATEWAY_REDIS_PASSWORD_FILE'] = secretPath('absent.pass');
    await expect(
      Test.createTestingModule({ imports: [GatewayConfigModule] }).compile(),
    ).rejects.toThrow(/GATEWAY_REDIS_PASSWORD_FILE/);
  });
});
