import { loadGatewayConfig } from '@gateway/infrastructure/config/gateway-config';

const FILES: Readonly<Record<string, string>> = {
  '/run/secrets/gateway_tls_cert': '-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----',
  '/run/secrets/gateway_tls_key': '-----BEGIN PRIVATE KEY-----\ntls\n-----END PRIVATE KEY-----',
  '/run/secrets/gateway_service_private_key':
    '-----BEGIN PRIVATE KEY-----\\nservice\\n-----END PRIVATE KEY-----',
  '/run/secrets/gateway_redis_password': 'redis-password-long-enough',
};

function readFile(path: string): string {
  const content = FILES[path];
  if (content === undefined) {
    throw new Error(`no such file: ${path}`);
  }
  return content;
}

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    GATEWAY_PORT: '8080',
    GATEWAY_API_PREFIX: '/api/v1',
    GATEWAY_TLS_CERT_FILE: '/run/secrets/gateway_tls_cert',
    GATEWAY_TLS_KEY_FILE: '/run/secrets/gateway_tls_key',
    GATEWAY_TLS_MIN_VERSION: 'TLSv1.2',
    GATEWAY_AUTH_BASE_URL: 'http://auth-service:3001',
    GATEWAY_USERS_BASE_URL: 'http://users-service:3002',
    GATEWAY_JWT_PUBLIC_KEYS_JSON:
      '{"stayhub-auth-2026-01":"-----BEGIN PUBLIC KEY-----\\npublic\\n-----END PUBLIC KEY-----"}',
    GATEWAY_JWT_ISSUER: 'https://auth.stayhub.internal',
    GATEWAY_JWT_AUDIENCE: 'stayhub-api',
    GATEWAY_SERVICE_KID: 'gateway-2026-01',
    GATEWAY_SERVICE_PRIVATE_KEY_FILE: '/run/secrets/gateway_service_private_key',
    GATEWAY_SERVICE_ISSUER: 'stayhub-api-gateway',
    GATEWAY_SERVICE_AUDIENCE: 'stayhub-auth-service',
    GATEWAY_SERVICE_SCOPE: 'auth:invoke',
    GATEWAY_SERVICE_TTL_SECONDS: '60',
    GATEWAY_REDIS_URL: 'redis://:change-me@gateway-redis:6379/0',
    GATEWAY_REDIS_PASSWORD_FILE: '/run/secrets/gateway_redis_password',
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
}

function load(overrides: NodeJS.ProcessEnv = {}): ReturnType<typeof loadGatewayConfig> {
  return loadGatewayConfig({ ...baseEnvironment(), ...overrides }, readFile);
}

function without(name: string): NodeJS.ProcessEnv {
  const environment = baseEnvironment();
  delete environment[name];
  return environment;
}

describe('loadGatewayConfig documented values (GW-009)', () => {
  it('exposes port 8080, prefix /api/v1 and the closed anti-abuse limits', () => {
    const config = load();
    expect(config.port).toBe(8080);
    expect(config.apiPrefix).toBe('/api/v1');
    expect(config.registerRateLimit).toEqual({ limit: 10, windowSeconds: 600 });
    expect(config.loginRateLimit).toEqual({ limit: 30, windowSeconds: 300 });
    expect(config.maxPhotoBytes).toBe(5000000);
  });

  it('reads the service JWT key and the Redis password from their secret files', () => {
    const config = load();
    expect(config.serviceJwt.privateKey).toBe(
      '-----BEGIN PRIVATE KEY-----\nservice\n-----END PRIVATE KEY-----',
    );
    expect(config.redis.password).toBe('redis-password-long-enough');
  });

  it('un-escapes the newlines of the user JWT public keys', () => {
    const config = load();
    expect(config.userJwt.publicKeys['stayhub-auth-2026-01']).toBe(
      '-----BEGIN PUBLIC KEY-----\npublic\n-----END PUBLIC KEY-----',
    );
  });

  it('parses the trusted proxy allowlist and the edge Redis namespace', () => {
    const config = load();
    expect(config.trustedProxyCidrs).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    expect(config.redis.namespace).toBe('gateway:edge');
  });

  it('defaults the TLS minimum version to TLSv1.2 when absent', () => {
    const config = loadGatewayConfig(without('GATEWAY_TLS_MIN_VERSION'), readFile);
    expect(config.tls.minVersion).toBe('TLSv1.2');
  });

  it('omits the optional Swagger server URL when absent', () => {
    expect(load()).not.toHaveProperty('swaggerServerUrl');
    expect(load({ GATEWAY_SWAGGER_SERVER_URL: '/' }).swaggerServerUrl).toBe('/');
  });
});

describe('loadGatewayConfig fails fast on missing configuration (GW-009)', () => {
  const requiredNames = [
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

  it.each(requiredNames)('rejects when %s is absent', (name) => {
    expect(() => loadGatewayConfig(without(name), readFile)).toThrow(new RegExp(name));
  });

  it('rejects an empty NODE_ENV value that is not a known environment', () => {
    expect(() => load({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

describe('loadGatewayConfig rejects values that break the closed contract (GW-009)', () => {
  it('rejects any public port other than 8080 (D1)', () => {
    expect(() => load({ GATEWAY_PORT: '8443' })).toThrow(/GATEWAY_PORT/);
  });

  it('rejects any API prefix other than /api/v1', () => {
    expect(() => load({ GATEWAY_API_PREFIX: '/api/v2' })).toThrow(/GATEWAY_API_PREFIX/);
  });

  it('rejects 5 MiB (5242880) as the photo limit instead of 5.000.000 bytes', () => {
    expect(() => load({ GATEWAY_MAX_PHOTO_BYTES: '5242880' })).toThrow(/GATEWAY_MAX_PHOTO_BYTES/);
  });

  it('rejects rate limit values that drift from the spec', () => {
    expect(() => load({ GATEWAY_REGISTER_RATE_LIMIT: '11' })).toThrow(
      /GATEWAY_REGISTER_RATE_LIMIT/,
    );
    expect(() => load({ GATEWAY_LOGIN_RATE_WINDOW_SECONDS: '600' })).toThrow(
      /GATEWAY_LOGIN_RATE_WINDOW_SECONDS/,
    );
  });

  it('rejects a malformed trusted proxy allowlist', () => {
    expect(() => load({ GATEWAY_TRUSTED_PROXY_CIDRS: '10.0.0.0' })).toThrow(
      /GATEWAY_TRUSTED_PROXY_CIDRS/,
    );
    expect(() => load({ GATEWAY_TRUSTED_PROXY_CIDRS: '10.0.0.0/8,300.0.0.0/8' })).toThrow(
      /GATEWAY_TRUSTED_PROXY_CIDRS/,
    );
    expect(() => load({ GATEWAY_TRUSTED_PROXY_CIDRS: '10.0.0.0/64' })).toThrow(
      /GATEWAY_TRUSTED_PROXY_CIDRS/,
    );
  });

  it('rejects a Redis namespace that could corrupt edge keys', () => {
    expect(() => load({ GATEWAY_REDIS_NAMESPACE: 'gateway edge' })).toThrow(
      /GATEWAY_REDIS_NAMESPACE/,
    );
  });

  it('rejects a service JWT key file without PEM markers', () => {
    expect(() =>
      loadGatewayConfig(
        { ...baseEnvironment(), GATEWAY_SERVICE_PRIVATE_KEY_FILE: '/run/secrets/gateway_redis_password' },
        readFile,
      ),
    ).toThrow(/GATEWAY_SERVICE_PRIVATE_KEY_FILE/);
  });

  it('rejects a secret file that cannot be read', () => {
    expect(() =>
      loadGatewayConfig(
        { ...baseEnvironment(), GATEWAY_REDIS_PASSWORD_FILE: '/run/secrets/missing' },
        readFile,
      ),
    ).toThrow(/GATEWAY_REDIS_PASSWORD_FILE/);
  });

  it('rejects a Redis password shorter than eight characters', () => {
    const shortReadFile = (path: string): string =>
      path === '/run/secrets/gateway_redis_password' ? 'short' : readFile(path);
    expect(() => loadGatewayConfig(baseEnvironment(), shortReadFile)).toThrow(
      /GATEWAY_REDIS_PASSWORD_FILE/,
    );
  });

  it('rejects an unsupported TLS minimum version', () => {
    expect(() => load({ GATEWAY_TLS_MIN_VERSION: 'TLSv1.1' })).toThrow(/GATEWAY_TLS_MIN_VERSION/);
  });

  it('rejects destinations and Redis that do not use their expected protocol', () => {
    expect(() => load({ GATEWAY_AUTH_BASE_URL: 'ftp://auth-service' })).toThrow(
      /GATEWAY_AUTH_BASE_URL/,
    );
    expect(() => load({ GATEWAY_REDIS_URL: 'http://gateway-redis:6379' })).toThrow(/GATEWAY_REDIS_URL/);
  });

  it('rejects a destination that is not a parseable URL', () => {
    expect(() => load({ GATEWAY_USERS_BASE_URL: 'not-a-url' })).toThrow(/GATEWAY_USERS_BASE_URL/);
  });

  it('rejects user JWT public keys that are not a JSON object keyed by kid', () => {
    expect(() => load({ GATEWAY_JWT_PUBLIC_KEYS_JSON: 'not-json' })).toThrow(
      /GATEWAY_JWT_PUBLIC_KEYS_JSON must be valid JSON/,
    );
    expect(() => load({ GATEWAY_JWT_PUBLIC_KEYS_JSON: '[]' })).toThrow(
      /must be a JSON object keyed by kid/,
    );
    expect(() => load({ GATEWAY_JWT_PUBLIC_KEYS_JSON: '{}' })).toThrow(
      /must contain at least one PEM public key/,
    );
    expect(() => load({ GATEWAY_JWT_PUBLIC_KEYS_JSON: '{"kid":123}' })).toThrow(
      /must contain at least one PEM public key/,
    );
  });

  it('rejects a secret file that exists but is empty', () => {
    const emptyReadFile = (path: string): string => (path === '/run/secrets/gateway_redis_password' ? '  \n' : readFile(path));
    expect(() => loadGatewayConfig(baseEnvironment(), emptyReadFile)).toThrow(
      /GATEWAY_REDIS_PASSWORD_FILE points to an empty file/,
    );
  });
});
