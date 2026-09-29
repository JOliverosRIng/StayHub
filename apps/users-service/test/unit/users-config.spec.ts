import { loadUsersConfig } from '@users/infrastructure/config/users-config';

const PEM = '-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----';

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    USERS_PORT: '3002',
    USERS_DATABASE_URL: 'postgresql://stayhub_users:pw@users-db:5432/users_db?schema=public',
    USERS_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'stayhub-auth-2026-01': PEM }),
    USERS_JWT_ISSUER: 'https://auth.stayhub.internal',
    USERS_JWT_AUDIENCE: 'stayhub-api',
    USERS_SERVICE_AUTH_PUBLIC_KEYS_JSON: JSON.stringify({ 'auth-users-2026-01': PEM }),
    USERS_SERVICE_AUTH_ISSUER: 'stayhub-auth-service',
    USERS_SERVICE_AUTH_AUDIENCE: 'stayhub-users-service',
    USERS_SERVICE_AUTH_REGISTRATION_SCOPE: 'users:registrations',
    USERS_SERVICE_AUTH_LOOKUP_SCOPE: 'users:login-identities',
    USERS_MAX_PHOTO_BYTES: '5000000',
    USERS_OTLP_ENDPOINT: 'http://otel-collector:4318',
    USERS_OTEL_SERVICE_NAME: 'stayhub-users-service',
  };
}

function without(name: string): NodeJS.ProcessEnv {
  const environment = validEnvironment();
  delete environment[name];
  return environment;
}

function withValue(name: string, value: string): NodeJS.ProcessEnv {
  return { ...validEnvironment(), [name]: value };
}

describe('loadUsersConfig', () => {
  it('returns a typed configuration for a complete environment', () => {
    const config = loadUsersConfig(validEnvironment());

    expect(config).toEqual({
      environment: 'test',
      port: 3002,
      databaseUrl: 'postgresql://stayhub_users:pw@users-db:5432/users_db?schema=public',
      userJwt: {
        publicKeys: { 'stayhub-auth-2026-01': '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----' },
        issuer: 'https://auth.stayhub.internal',
        audience: 'stayhub-api',
      },
      serviceAuth: {
        publicKeys: { 'auth-users-2026-01': '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----' },
        issuer: 'stayhub-auth-service',
        audience: 'stayhub-users-service',
        registrationScope: 'users:registrations',
        lookupScope: 'users:login-identities',
      },
      maxPhotoBytes: 5_000_000,
      otlpEndpoint: 'http://otel-collector:4318',
      otelServiceName: 'stayhub-users-service',
    });
  });

  it('defaults NODE_ENV to development', () => {
    expect(loadUsersConfig(without('NODE_ENV')).environment).toBe('development');
  });

  it.each([
    'USERS_PORT',
    'USERS_DATABASE_URL',
    'USERS_JWT_PUBLIC_KEYS_JSON',
    'USERS_JWT_ISSUER',
    'USERS_JWT_AUDIENCE',
    'USERS_SERVICE_AUTH_PUBLIC_KEYS_JSON',
    'USERS_SERVICE_AUTH_ISSUER',
    'USERS_SERVICE_AUTH_AUDIENCE',
    'USERS_SERVICE_AUTH_REGISTRATION_SCOPE',
    'USERS_SERVICE_AUTH_LOOKUP_SCOPE',
    'USERS_MAX_PHOTO_BYTES',
    'USERS_OTLP_ENDPOINT',
    'USERS_OTEL_SERVICE_NAME',
  ])('fails when %s is missing', (name) => {
    expect(() => loadUsersConfig(without(name))).toThrow(`${name} is required`);
  });

  it('fails when a required value is blank', () => {
    expect(() => loadUsersConfig(withValue('USERS_JWT_ISSUER', '   '))).toThrow(
      'USERS_JWT_ISSUER is required',
    );
  });

  it.each(['3001', '0', 'abc', '3002.5'])('rejects USERS_PORT=%s', (port) => {
    expect(() => loadUsersConfig(withValue('USERS_PORT', port))).toThrow('USERS_PORT');
  });

  it.each(['4999999', '5000001', '5242880'])('rejects USERS_MAX_PHOTO_BYTES=%s', (bytes) => {
    expect(() => loadUsersConfig(withValue('USERS_MAX_PHOTO_BYTES', bytes))).toThrow(
      'USERS_MAX_PHOTO_BYTES',
    );
  });

  it.each(['mysql://u:p@db:3306/users_db', 'not a url'])(
    'rejects USERS_DATABASE_URL=%s',
    (url) => {
      expect(() => loadUsersConfig(withValue('USERS_DATABASE_URL', url))).toThrow(
        'USERS_DATABASE_URL',
      );
    },
  );

  it('rejects a non-http OTLP endpoint', () => {
    expect(() => loadUsersConfig(withValue('USERS_OTLP_ENDPOINT', 'ftp://collector'))).toThrow(
      'USERS_OTLP_ENDPOINT',
    );
  });

  it.each([
    ['not json', 'must be valid JSON'],
    ['[]', 'must be a JSON object keyed by kid'],
    ['{}', 'must contain at least one PEM public key'],
    [JSON.stringify({ kid: 'not a pem' }), 'must contain at least one PEM public key'],
  ])('rejects public keys %s', (raw, message) => {
    expect(() => loadUsersConfig(withValue('USERS_JWT_PUBLIC_KEYS_JSON', raw))).toThrow(message);
  });

  it('requires different registration and lookup scopes', () => {
    expect(() =>
      loadUsersConfig(withValue('USERS_SERVICE_AUTH_LOOKUP_SCOPE', 'users:registrations')),
    ).toThrow('must differ');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadUsersConfig(withValue('NODE_ENV', 'staging'))).toThrow('NODE_ENV');
  });

  it('never includes secret values in error messages', () => {
    const secretUrl = 'mysql://stayhub_users:super-secret@users-db:3306/users_db';
    let message = '';
    try {
      loadUsersConfig(withValue('USERS_DATABASE_URL', secretUrl));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('USERS_DATABASE_URL');
    expect(message).not.toContain('super-secret');
  });
});
