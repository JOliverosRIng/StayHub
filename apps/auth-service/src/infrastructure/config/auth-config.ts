export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface Argon2Config {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

export interface JwtKeyConfig {
  readonly activeKid: string;
  readonly privateKey: string;
  readonly publicKeys: Readonly<Record<string, string>>;
  readonly issuer: string;
  readonly audience: string;
}

export interface ServiceJwtInboundConfig {
  readonly publicKeys: Readonly<Record<string, string>>;
  readonly issuer: string;
  readonly audience: string;
  readonly scope: string;
}

export interface ServiceJwtOutboundConfig {
  readonly privateKey: string;
  readonly kid: string;
  readonly issuer: string;
  readonly audience: string;
  readonly scope: string;
  readonly ttlSeconds: number;
}

export interface AuthConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly argon2: Argon2Config;
  readonly accessJwt: JwtKeyConfig;
  readonly inboundServiceJwt: ServiceJwtInboundConfig;
  readonly outboundServiceJwt: ServiceJwtOutboundConfig;
  readonly usersServiceUrl: string;
  readonly usersTimeoutMs: number;
  readonly usersCircuitFailureThreshold: number;
  readonly usersCircuitResetMs: number;
  readonly accessTokenTtlSeconds: 3600;
  readonly sessionAbsoluteTtlSeconds: 604800;
  readonly refreshTokenHmacSecret: string;
  readonly registrationFingerprintSecret: string;
  readonly reconciler: {
    readonly intervalSeconds: number;
    readonly ttlSeconds: number;
    readonly batchSize: number;
    readonly maxAttempts: number;
  };
  readonly otlpEndpoint: string;
  readonly otelServiceName: string;
}

type Environment = NodeJS.ProcessEnv;

export function loadAuthConfig(environment: Environment = process.env): AuthConfig {
  const nodeEnvironment = optional(environment, 'NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  return {
    environment: nodeEnvironment as AuthConfig['environment'],
    port: integer(environment, 'AUTH_PORT', 1, 65535),
    databaseUrl: url(environment, 'AUTH_DATABASE_URL', ['postgresql:']),
    redisUrl: url(environment, 'AUTH_REDIS_URL', ['redis:', 'rediss:']),
    argon2: {
      memoryCost: integer(environment, 'AUTH_ARGON2_MEMORY_COST', 8192, 1_048_576),
      timeCost: integer(environment, 'AUTH_ARGON2_TIME_COST', 1, 20),
      parallelism: integer(environment, 'AUTH_ARGON2_PARALLELISM', 1, 16),
    },
    accessJwt: {
      activeKid: required(environment, 'AUTH_JWT_ACTIVE_KID'),
      privateKey: pem(environment, 'AUTH_JWT_PRIVATE_KEY'),
      publicKeys: publicKeys(environment, 'AUTH_JWT_PUBLIC_KEYS_JSON'),
      issuer: required(environment, 'AUTH_JWT_ISSUER'),
      audience: required(environment, 'AUTH_JWT_AUDIENCE'),
    },
    inboundServiceJwt: {
      publicKeys: publicKeys(environment, 'AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON'),
      issuer: required(environment, 'AUTH_INBOUND_SERVICE_ISSUER'),
      audience: required(environment, 'AUTH_INBOUND_SERVICE_AUDIENCE'),
      scope: required(environment, 'AUTH_INBOUND_SERVICE_SCOPE'),
    },
    outboundServiceJwt: {
      privateKey: pem(environment, 'AUTH_OUTBOUND_SERVICE_PRIVATE_KEY'),
      kid: required(environment, 'AUTH_OUTBOUND_SERVICE_KID'),
      issuer: required(environment, 'AUTH_OUTBOUND_SERVICE_ISSUER'),
      audience: required(environment, 'AUTH_OUTBOUND_SERVICE_AUDIENCE'),
      scope: required(environment, 'AUTH_OUTBOUND_SERVICE_SCOPE'),
      ttlSeconds: integer(environment, 'AUTH_OUTBOUND_SERVICE_TTL_SECONDS', 1, 300),
    },
    usersServiceUrl: url(environment, 'USERS_SERVICE_URL', ['http:', 'https:']),
    usersTimeoutMs: integer(environment, 'AUTH_USERS_TIMEOUT_MS', 100, 30_000),
    usersCircuitFailureThreshold: integer(
      environment,
      'AUTH_USERS_CIRCUIT_FAILURE_THRESHOLD',
      1,
      100,
    ),
    usersCircuitResetMs: integer(environment, 'AUTH_USERS_CIRCUIT_RESET_MS', 1000, 300_000),
    accessTokenTtlSeconds: exactInteger(environment, 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 3600),
    sessionAbsoluteTtlSeconds: exactInteger(
      environment,
      'AUTH_SESSION_ABSOLUTE_TTL_SECONDS',
      604800,
    ),
    refreshTokenHmacSecret: secret(environment, 'AUTH_REFRESH_TOKEN_HMAC_SECRET'),
    registrationFingerprintSecret: secret(
      environment,
      'AUTH_REGISTRATION_FINGERPRINT_SECRET',
    ),
    reconciler: {
      intervalSeconds: integer(environment, 'AUTH_RECONCILER_INTERVAL_SECONDS', 1, 3600),
      ttlSeconds: integer(environment, 'AUTH_RECONCILER_TTL_SECONDS', 60, 86_400),
      batchSize: integer(environment, 'AUTH_RECONCILER_BATCH_SIZE', 1, 1000),
      maxAttempts: integer(environment, 'AUTH_RECONCILER_MAX_ATTEMPTS', 1, 100),
    },
    otlpEndpoint: url(environment, 'OTEL_EXPORTER_OTLP_ENDPOINT', ['http:', 'https:']),
    otelServiceName: required(environment, 'OTEL_SERVICE_NAME'),
  };
}

function required(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(environment: Environment, name: string, fallback: string): string {
  return environment[name]?.trim() || fallback;
}

function integer(
  environment: Environment,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function exactInteger<const T extends number>(environment: Environment, name: string, expected: T): T {
  const value = integer(environment, name, expected, expected);
  return value as T;
}

function url(environment: Environment, name: string, protocols: readonly string[]): string {
  const value = required(environment, name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(' or ')}`);
  }
  return value;
}

function pem(environment: Environment, name: string): string {
  const value = required(environment, name).replace(/\\n/g, '\n');
  if (!value.includes('-----BEGIN ') || !value.includes('-----END ')) {
    throw new Error(`${name} must contain a PEM key`);
  }
  return value;
}

function publicKeys(environment: Environment, name: string): Readonly<Record<string, string>> {
  const raw = required(environment, name);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object keyed by kid`);
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.some(([kid, key]) => kid === '' || typeof key !== 'string')) {
    throw new Error(`${name} must contain at least one PEM public key`);
  }
  return Object.fromEntries(entries.map(([kid, key]) => [kid, (key as string).replace(/\\n/g, '\n')]));
}

function secret(environment: Environment, name: string): string {
  const value = required(environment, name);
  if (value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  return value;
}
