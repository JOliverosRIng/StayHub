import { MAX_PROFILE_PHOTO_BYTES } from '../../domain/shared/limits';

export const USERS_CONFIG = Symbol('USERS_CONFIG');

export const USERS_SERVICE_PORT = 3002;
export const MAX_PHOTO_BYTES = MAX_PROFILE_PHOTO_BYTES;

export interface UserJwtConfig {
  readonly publicKeys: Readonly<Record<string, string>>;
  readonly issuer: string;
  readonly audience: string;
}

export interface ServiceAuthConfig {
  readonly publicKeys: Readonly<Record<string, string>>;
  readonly issuer: string;
  readonly audience: string;
  readonly registrationScope: string;
  readonly lookupScope: string;
}

export interface UsersConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly port: typeof USERS_SERVICE_PORT;
  readonly databaseUrl: string;
  readonly userJwt: UserJwtConfig;
  readonly serviceAuth: ServiceAuthConfig;
  readonly maxPhotoBytes: typeof MAX_PHOTO_BYTES;
  readonly otlpEndpoint: string;
  readonly otelServiceName: string;
}

type Environment = NodeJS.ProcessEnv;

const ENVIRONMENTS = ['development', 'test', 'production'] as const;

export function loadUsersConfig(environment: Environment = process.env): UsersConfig {
  const nodeEnvironment = environment['NODE_ENV']?.trim() || 'development';
  if (!isEnvironment(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const registrationScope = required(environment, 'USERS_SERVICE_AUTH_REGISTRATION_SCOPE');
  const lookupScope = required(environment, 'USERS_SERVICE_AUTH_LOOKUP_SCOPE');
  if (registrationScope === lookupScope) {
    throw new Error(
      'USERS_SERVICE_AUTH_REGISTRATION_SCOPE and USERS_SERVICE_AUTH_LOOKUP_SCOPE must differ',
    );
  }

  return {
    environment: nodeEnvironment,
    port: exactInteger(environment, 'USERS_PORT', USERS_SERVICE_PORT),
    databaseUrl: url(environment, 'USERS_DATABASE_URL', ['postgresql:', 'postgres:']),
    userJwt: {
      publicKeys: publicKeys(environment, 'USERS_JWT_PUBLIC_KEYS_JSON'),
      issuer: required(environment, 'USERS_JWT_ISSUER'),
      audience: required(environment, 'USERS_JWT_AUDIENCE'),
    },
    serviceAuth: {
      publicKeys: publicKeys(environment, 'USERS_SERVICE_AUTH_PUBLIC_KEYS_JSON'),
      issuer: required(environment, 'USERS_SERVICE_AUTH_ISSUER'),
      audience: required(environment, 'USERS_SERVICE_AUTH_AUDIENCE'),
      registrationScope,
      lookupScope,
    },
    maxPhotoBytes: exactInteger(environment, 'USERS_MAX_PHOTO_BYTES', MAX_PHOTO_BYTES),
    otlpEndpoint: url(environment, 'USERS_OTLP_ENDPOINT', ['http:', 'https:']),
    otelServiceName: required(environment, 'USERS_OTEL_SERVICE_NAME'),
  };
}

function isEnvironment(value: string): value is UsersConfig['environment'] {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

function required(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function exactInteger<const T extends number>(
  environment: Environment,
  name: string,
  expected: T,
): T {
  const value = Number(required(environment, name));
  if (value !== expected) {
    throw new Error(`${name} must be exactly ${expected}`);
  }
  return expected;
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
  const entries = Object.entries(parsed as Record<string, unknown>).map(
    ([kid, key]) => [kid, typeof key === 'string' ? key.replace(/\\n/g, '\n') : key] as const,
  );
  const valid =
    entries.length > 0 &&
    entries.every(
      ([kid, key]) =>
        kid !== '' &&
        typeof key === 'string' &&
        key.includes('-----BEGIN PUBLIC KEY-----') &&
        key.includes('-----END PUBLIC KEY-----'),
    );
  if (!valid) {
    throw new Error(`${name} must contain at least one PEM public key`);
  }
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
}
