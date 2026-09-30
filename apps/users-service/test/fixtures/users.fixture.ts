import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import type { UsersConfig } from '../../src/infrastructure/config/users-config';
export const accessKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const serviceKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export function testConfig(databaseUrl: string): UsersConfig {
  return { port: 3002, databaseUrl, userJwt: { issuer: 'test-auth', audience: 'test-api', kid: 'access-v1', publicKey: accessKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    serviceJwt: { issuer: 'test-service', audience: 'test-users', kid: 'service-v1', publicKey: serviceKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    registrationScope: 'users:registration', lookupScope: 'users:login-identity', maxPhotoBytes: 5_000_000, otlpEndpoint: 'http://localhost:4318', development: false };
}
export function pendingFixture(): { registrationId: string; userId: string; name: string; email: string; role: 'GUEST' } {
  return { registrationId: randomUUID(), userId: randomUUID(), name: 'Synthetic User', email: `${randomUUID()}@example.test`, role: 'GUEST' };
}
export function serviceToken(scope = 'users:registration', claims: Record<string, unknown> = {}): string {
  return sign({ iss: 'test-service', aud: 'test-users', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 120, scope, ...claims }, serviceKeys.privateKey, { algorithm: 'RS256', keyid: 'service-v1' });
}
export function userToken(sub: string, claims: Record<string, unknown> = {}): string {
  return sign({ sub, sid: randomUUID(), jti: randomUUID(), role: 'GUEST', iss: 'test-auth', aud: 'test-api', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims }, accessKeys.privateKey, { algorithm: 'RS256', keyid: 'access-v1' });
}
