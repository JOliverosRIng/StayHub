import { generateKeyPairSync } from 'node:crypto';
import { loadUsersConfig } from '../../src/infrastructure/config/users-config';

const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
export const validEnv = {
  USERS_PORT: '3002', USERS_DATABASE_URL: 'postgresql://users:synthetic@localhost:5432/users_db',
  USERS_JWT_ISSUER: 'auth', USERS_JWT_AUDIENCE: 'api', USERS_JWT_KID: 'access-v1', USERS_JWT_PUBLIC_KEY: publicKey,
  USERS_SERVICE_JWT_ISSUER: 'auth-service', USERS_SERVICE_JWT_AUDIENCE: 'users', USERS_SERVICE_JWT_KID: 'service-v1', USERS_SERVICE_JWT_PUBLIC_KEY: publicKey,
  USERS_REGISTRATION_SCOPE: 'users:registration', USERS_LOOKUP_SCOPE: 'users:login-identity',
  USERS_MAX_PHOTO_BYTES: '5000000', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
};
describe('USR-010 configuration', () => {
  it('accepts the Users configuration', () => { expect(loadUsersConfig(validEnv).port).toBe(3002); });
  it.each(Object.keys(validEnv))('requires %s', (key) => {
    expect(() => loadUsersConfig({ ...validEnv, [key]: '' })).toThrow();
  });
  it.each(['postgresql://u:p@localhost/auth_db', 'http://u:p@localhost/users_db', 'postgresql://localhost/users_db'])('rejects foreign or uncredentialed database %s', (url) => {
    expect(() => loadUsersConfig({ ...validEnv, USERS_DATABASE_URL: url })).toThrow();
  });
  it('enforces the decimal photo limit and fixed port', () => {
    expect(() => loadUsersConfig({ ...validEnv, USERS_MAX_PHOTO_BYTES: '5242880' })).toThrow();
    expect(() => loadUsersConfig({ ...validEnv, USERS_PORT: '3001' })).toThrow();
  });
});
