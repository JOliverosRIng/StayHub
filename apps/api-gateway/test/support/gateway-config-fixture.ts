import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadGatewayConfig,
  type GatewayConfig,
} from '@gateway/infrastructure/config/gateway-config';

import { createSelfSignedTlsFixture, type TlsFixture } from './tls-fixture';

export interface GatewayConfigFixture {
  readonly config: GatewayConfig;
  readonly env: Record<string, string>;
  readonly tls: TlsFixture;
  readonly certificatePath: string;
  readonly keyPath: string;
  readonly servicePrivateKeyPem: string;
  readonly servicePublicKeyPem: string;
}

export function createTestGatewayConfig(
  overrides: Record<string, string> = {},
): GatewayConfigFixture {
  const tls = createSelfSignedTlsFixture('localhost');
  const directory = mkdtempSync(join(tmpdir(), 'gateway-fixture-'));
  const certificatePath = join(directory, 'tls.crt');
  const keyPath = join(directory, 'tls.key');
  const servicePath = join(directory, 'service.pem');
  const redisPath = join(directory, 'redis.pass');
  writeFileSync(certificatePath, tls.certPem);
  writeFileSync(keyPath, tls.keyPem);
  const serviceKeys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const servicePrivateKeyPem = serviceKeys.privateKey;
  const servicePublicKeyPem = serviceKeys.publicKey;
  writeFileSync(servicePath, servicePrivateKeyPem);
  writeFileSync(redisPath, 'redis-password-long-enough');

  const env: Record<string, string> = {
    NODE_ENV: 'test',
    GATEWAY_PORT: '8080',
    GATEWAY_API_PREFIX: '/api/v1',
    GATEWAY_TLS_CERT_FILE: certificatePath,
    GATEWAY_TLS_KEY_FILE: keyPath,
    GATEWAY_TLS_MIN_VERSION: 'TLSv1.2',
    GATEWAY_AUTH_BASE_URL: 'http://auth-service:3001',
    GATEWAY_USERS_BASE_URL: 'http://users-service:3002',
    GATEWAY_JWT_ISSUER: 'https://auth.stayhub.internal',
    GATEWAY_JWT_AUDIENCE: 'stayhub-api',
    GATEWAY_SERVICE_KID: 'gateway-2026-01',
    GATEWAY_SERVICE_PRIVATE_KEY_FILE: servicePath,
    GATEWAY_SERVICE_ISSUER: 'stayhub-api-gateway',
    GATEWAY_SERVICE_AUDIENCE: 'stayhub-auth-service',
    GATEWAY_SERVICE_SCOPE: 'auth:invoke',
    GATEWAY_SERVICE_TTL_SECONDS: '60',
    GATEWAY_REDIS_URL: 'redis://:change-me@gateway-redis:6379/0',
    GATEWAY_REDIS_PASSWORD_FILE: redisPath,
    GATEWAY_REDIS_NAMESPACE: 'gateway:edge',
    GATEWAY_TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
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
    GATEWAY_JWT_PUBLIC_KEYS_JSON: JSON.stringify({
      'stayhub-auth-2026-01': servicePublicKeyPem.replace(/\n/g, '\\n'),
    }),
    ...overrides,
  };

  const config = loadGatewayConfig(env);

  return {
    config,
    env,
    tls,
    certificatePath,
    keyPath,
    servicePrivateKeyPem,
    servicePublicKeyPem,
  };
}
