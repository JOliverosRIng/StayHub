import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadGatewayConfig } from '@gateway/infrastructure/config/gateway-config';

const ENV_EXAMPLE = join(__dirname, '../../../..', '.env.example');

const SECRET_CONTENTS: Readonly<Record<string, string>> = {
  '/run/secrets/gateway_redis_password': 'redis-password-long-enough',
};

function readFile(path: string): string {
  const secret = SECRET_CONTENTS[path];
  if (secret !== undefined) return secret;
  return '-----BEGIN CERTIFICATE-----\ncertificate\n-----END CERTIFICATE-----';
}

function gatewayEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const line of readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match === null) continue;
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) continue;
    if (!key.startsWith('GATEWAY_')) continue;
    environment[key] = value.trim();
  }
  return environment;
}

describe('.env.example matches the typed configuration (GW-009)', () => {
  it('loads without any validation error using only the documented example values', () => {
    const config = loadGatewayConfig(gatewayEnvironment(), readFile);
    expect(config.port).toBe(8080);
    expect(config.apiPrefix).toBe('/api/v1');
    expect(config.maxPhotoBytes).toBe(5000000);
    expect(config.redis.namespace).toBe('gateway:edge');
  });

  it('documents every variable that the loader requires', () => {
    const documented = new Set(Object.keys(gatewayEnvironment()));
    const required = [
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
    ];
    const missing = required.filter((name) => !documented.has(name));
    expect(missing).toEqual([]);
  });
});
