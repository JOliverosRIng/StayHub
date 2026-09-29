import { readFileSync } from 'node:fs';

export const GATEWAY_CONFIG = Symbol('GATEWAY_CONFIG');

export type FileReader = (path: string) => string;

export interface TlsConfig {
  readonly certFile: string;
  readonly keyFile: string;
  readonly minVersion: 'TLSv1.2' | 'TLSv1.3';
}

export interface UserJwtConfig {
  readonly publicKeys: Readonly<Record<string, string>>;
  readonly issuer: string;
  readonly audience: string;
}

export interface ServiceJwtConfig {
  readonly kid: string;
  readonly privateKey: string;
  readonly issuer: string;
  readonly audience: string;
  readonly scope: string;
  readonly ttlSeconds: number;
}

export interface RedisConfig {
  readonly url: string;
  readonly password: string;
  readonly namespace: string;
}

export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface CircuitPolicy {
  readonly timeoutMs: number;
  readonly failureThreshold: number;
  readonly resetMs: number;
}

export interface GatewayConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly port: 8080;
  readonly apiPrefix: '/api/v1';
  readonly tls: TlsConfig;
  readonly authBaseUrl: string;
  readonly usersBaseUrl: string;
  readonly userJwt: UserJwtConfig;
  readonly serviceJwt: ServiceJwtConfig;
  readonly redis: RedisConfig;
  readonly trustedProxyCidrs: readonly string[];
  readonly registerRateLimit: RateLimitPolicy;
  readonly loginRateLimit: RateLimitPolicy;
  readonly maxPhotoBytes: 5000000;
  readonly auth: CircuitPolicy;
  readonly users: CircuitPolicy;
  readonly introspectionTimeoutMs: number;
  readonly otlpEndpoint: string;
  readonly otelServiceName: string;
  readonly swaggerServerUrl?: string;
}

type Environment = NodeJS.ProcessEnv;

export function loadGatewayConfig(
  environment: Environment = process.env,
  readFile: FileReader = readFileFromDisk,
): GatewayConfig {
  const nodeEnvironment = optional(environment, 'NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const swaggerServerUrl = optionalString(environment, 'GATEWAY_SWAGGER_SERVER_URL');

  return {
    environment: nodeEnvironment as GatewayConfig['environment'],
    port: exactInteger(environment, 'GATEWAY_PORT', 8080),
    apiPrefix: exactString(environment, 'GATEWAY_API_PREFIX', '/api/v1'),
    tls: {
      certFile: readableFile(environment, 'GATEWAY_TLS_CERT_FILE', readFile),
      keyFile: readableFile(environment, 'GATEWAY_TLS_KEY_FILE', readFile),
      minVersion: tlsMinVersion(environment, 'GATEWAY_TLS_MIN_VERSION'),
    },
    authBaseUrl: url(environment, 'GATEWAY_AUTH_BASE_URL', ['http:', 'https:']),
    usersBaseUrl: url(environment, 'GATEWAY_USERS_BASE_URL', ['http:', 'https:']),
    userJwt: {
      publicKeys: publicKeys(environment, 'GATEWAY_JWT_PUBLIC_KEYS_JSON'),
      issuer: required(environment, 'GATEWAY_JWT_ISSUER'),
      audience: required(environment, 'GATEWAY_JWT_AUDIENCE'),
    },
    serviceJwt: {
      kid: required(environment, 'GATEWAY_SERVICE_KID'),
      privateKey: pemFile(environment, 'GATEWAY_SERVICE_PRIVATE_KEY_FILE', readFile),
      issuer: required(environment, 'GATEWAY_SERVICE_ISSUER'),
      audience: required(environment, 'GATEWAY_SERVICE_AUDIENCE'),
      scope: required(environment, 'GATEWAY_SERVICE_SCOPE'),
      ttlSeconds: integer(environment, 'GATEWAY_SERVICE_TTL_SECONDS', 1, 300),
    },
    redis: {
      url: url(environment, 'GATEWAY_REDIS_URL', ['redis:', 'rediss:']),
      password: secretFile(environment, 'GATEWAY_REDIS_PASSWORD_FILE', readFile, 8),
      namespace: keyNamespace(environment, 'GATEWAY_REDIS_NAMESPACE'),
    },
    trustedProxyCidrs: cidrs(environment, 'GATEWAY_TRUSTED_PROXY_CIDRS'),
    registerRateLimit: {
      limit: exactInteger(environment, 'GATEWAY_REGISTER_RATE_LIMIT', 10),
      windowSeconds: exactInteger(environment, 'GATEWAY_REGISTER_RATE_WINDOW_SECONDS', 600),
    },
    loginRateLimit: {
      limit: exactInteger(environment, 'GATEWAY_LOGIN_RATE_LIMIT', 30),
      windowSeconds: exactInteger(environment, 'GATEWAY_LOGIN_RATE_WINDOW_SECONDS', 300),
    },
    maxPhotoBytes: exactInteger(environment, 'GATEWAY_MAX_PHOTO_BYTES', 5000000),
    auth: circuit(environment, 'GATEWAY_AUTH_'),
    users: circuit(environment, 'GATEWAY_USERS_'),
    introspectionTimeoutMs: integer(environment, 'GATEWAY_INTROSPECTION_TIMEOUT_MS', 100, 30_000),
    otlpEndpoint: url(environment, 'GATEWAY_OTEL_EXPORTER_OTLP_ENDPOINT', ['http:', 'https:']),
    otelServiceName: required(environment, 'GATEWAY_OTEL_SERVICE_NAME'),
    ...(swaggerServerUrl === undefined ? {} : { swaggerServerUrl }),
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

function optionalString(environment: Environment, name: string): string | undefined {
  const value = environment[name];
  if (value === undefined || value.trim() === '') return undefined;
  return value;
}

function exactString<const T extends string>(environment: Environment, name: string, expected: T): T {
  const value = required(environment, name);
  if (value !== expected) {
    throw new Error(`${name} must be ${expected}`);
  }
  return value as T;
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

function fileContent(
  environment: Environment,
  name: string,
  readFile: FileReader,
): string {
  const path = required(environment, name);
  let content: string;
  try {
    content = readFile(path);
  } catch {
    throw new Error(`${name} points to a path that cannot be read`);
  }
  if (content.trim() === '') {
    throw new Error(`${name} points to an empty file`);
  }
  return content;
}

function readableFile(environment: Environment, name: string, readFile: FileReader): string {
  fileContent(environment, name, readFile);
  return required(environment, name);
}

function pemFile(environment: Environment, name: string, readFile: FileReader): string {
  const value = fileContent(environment, name, readFile).replace(/\\n/g, '\n');
  if (!value.includes('-----BEGIN ') || !value.includes('-----END ')) {
    throw new Error(`${name} must point to a file containing a PEM key`);
  }
  return value;
}

function secretFile(
  environment: Environment,
  name: string,
  readFile: FileReader,
  minimumLength: number,
): string {
  const value = fileContent(environment, name, readFile);
  if (value.length < minimumLength) {
    throw new Error(`${name} must point to a file with at least ${minimumLength} characters`);
  }
  return value;
}

function keyNamespace(environment: Environment, name: string): string {
  const value = required(environment, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(value)) {
    throw new Error(`${name} must be a short namespace of letters, digits, colon, underscore or hyphen`);
  }
  return value;
}

function cidrs(environment: Environment, name: string): readonly string[] {
  const entries = required(environment, name)
    .split(',')
    .map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => !isCidr(entry))) {
    throw new Error(`${name} must be a comma-separated list of CIDR blocks`);
  }
  return entries;
}

function isCidr(value: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(value);
  if (match === null) return false;
  const prefix = match[5];
  if (prefix === undefined || Number(prefix) > 32) return false;
  return match.slice(1, 5).every((octet) => Number(octet) <= 255);
}

function tlsMinVersion(environment: Environment, name: string): TlsConfig['minVersion'] {
  const value = optional(environment, name, 'TLSv1.2');
  if (value !== 'TLSv1.2' && value !== 'TLSv1.3') {
    throw new Error(`${name} must be TLSv1.2 or TLSv1.3`);
  }
  return value;
}

function circuit(environment: Environment, prefix: string): CircuitPolicy {
  return {
    timeoutMs: integer(environment, `${prefix}TIMEOUT_MS`, 100, 30_000),
    failureThreshold: integer(environment, `${prefix}CIRCUIT_FAILURE_THRESHOLD`, 1, 100),
    resetMs: integer(environment, `${prefix}CIRCUIT_RESET_MS`, 1000, 300_000),
  };
}

function readFileFromDisk(path: string): string {
  return readFileSync(path, 'utf8');
}
