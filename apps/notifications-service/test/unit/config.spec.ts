import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadNotificationsConfig } from '../../src/infrastructure/config/notifications-config';

const accessKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const accessPublicKey = accessKey.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const servicePublicKey = serviceKey.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function validEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    NOTIFICATIONS_PORT: '3009',
    NOTIFICATIONS_DATABASE_URL: 'postgresql://notifications:synthetic@127.0.0.1:55439/notifications_db',
    NOTIFICATIONS_JWT_ISSUER: 'https://auth.test',
    NOTIFICATIONS_JWT_AUDIENCE: 'stayhub-api-test',
    NOTIFICATIONS_JWT_KID: 'access-test-1',
    NOTIFICATIONS_JWT_PUBLIC_KEY: accessPublicKey,
    NOTIFICATIONS_SERVICE_JWT_ISSUER: 'https://auth-service.test',
    NOTIFICATIONS_SERVICE_JWT_AUDIENCE: 'stayhub-notifications-service-test',
    NOTIFICATIONS_SERVICE_JWT_KID: 'service-test-1',
    NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY: servicePublicKey,
    NOTIFICATIONS_SEND_SCOPE: 'notifications:send',
    ...overrides,
  };
}

describe('notifications configuration (NTF-002)', () => {
  it('documents only synthetic local values and file-backed public keys', () => {
    const sample = readFileSync('.env.example', 'utf8');
    expect(sample).toContain('NOTIFICATIONS_PORT=3009');
    expect(sample).toContain('/notifications_db');
    expect(sample).toContain('NOTIFICATIONS_JWT_PUBLIC_KEY_FILE=');
    expect(sample).toContain('NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY_FILE=');
    expect(sample).not.toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----|password=[^\s]+@/i);
  });

  it('loads the fixed port, private database URL and distinct JWT settings', () => {
    const config = loadNotificationsConfig(validEnvironment());

    expect(config.port).toBe(3009);
    expect(config.databaseUrl).toContain('/notifications_db');
    expect(config.accessJwt).toMatchObject({
      issuer: 'https://auth.test',
      audience: 'stayhub-api-test',
      kid: 'access-test-1',
      maxAgeSeconds: 3600,
    });
    expect(config.serviceJwt).toMatchObject({
      issuer: 'https://auth-service.test',
      audience: 'stayhub-notifications-service-test',
      kid: 'service-test-1',
      maxAgeSeconds: 300,
    });
    expect(config.sendScope).toBe('notifications:send');
  });

  it.each([
    ['NOTIFICATIONS_PORT', '3008'],
    ['NOTIFICATIONS_DATABASE_URL', 'postgresql://notifications:synthetic@localhost/users_db'],
    ['NOTIFICATIONS_JWT_ISSUER', ''],
    ['NOTIFICATIONS_SERVICE_JWT_AUDIENCE', ''],
    ['NOTIFICATIONS_SEND_SCOPE', 'notifications:send other:scope'],
  ])('rejects invalid %s configuration', (key, value) => {
    expect(() => loadNotificationsConfig(validEnvironment({ [key]: value }))).toThrow();
  });

  it('rejects a missing required configuration value', () => {
    expect(() => loadNotificationsConfig(validEnvironment({ NOTIFICATIONS_PORT: undefined }))).toThrow(
      'Missing configuration: NOTIFICATIONS_PORT',
    );
  });

  it('rejects private keys and RSA keys below 2048 bits', () => {
    expect(() => loadNotificationsConfig(validEnvironment({
      NOTIFICATIONS_JWT_PUBLIC_KEY: accessKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    }))).toThrow('Invalid configuration: NOTIFICATIONS_JWT_PUBLIC_KEY');

    const weakKey = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey
      .export({ type: 'spki', format: 'pem' }).toString();
    expect(() => loadNotificationsConfig(validEnvironment({
      NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY: weakKey,
    }))).toThrow('Invalid configuration: NOTIFICATIONS_SERVICE_JWT_PUBLIC_KEY');
  });

  it('reads database and public-key values from configured secret files', () => {
    expect(() => loadNotificationsConfig(validEnvironment({
      NOTIFICATIONS_DATABASE_URL_FILE: 'missing-notifications-database-secret',
    }))).toThrow('Invalid configuration: NOTIFICATIONS_DATABASE_URL');
    expect(() => loadNotificationsConfig(validEnvironment({
      NOTIFICATIONS_JWT_PUBLIC_KEY_FILE: 'missing-notifications-public-key',
    }))).toThrow('Invalid configuration: NOTIFICATIONS_JWT_PUBLIC_KEY');
  });
});
