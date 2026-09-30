import type { AuthConfig } from '@auth/infrastructure/config/auth-config';
import { Argon2PasswordHasher } from '@auth/infrastructure/security/argon2-password-hasher';

const config: AuthConfig = {
  environment: 'test',
  port: 3001,
  databaseUrl: 'postgresql://stayhub_auth:test@127.0.0.1:55432/auth_test?schema=public',
  redisUrl: 'redis://:test@127.0.0.1:56379/15',
  argon2: { memoryCost: 8192, timeCost: 2, parallelism: 1 },
  accessJwt: {
    activeKid: 'test-kid',
    privateKey: 'unused',
    publicKeys: { 'test-kid': 'unused' },
    issuer: 'https://auth.stayhub.test',
    audience: 'stayhub-api',
  },
  inboundServiceJwt: {
    publicKeys: { 'test-kid': 'unused' },
    issuer: 'stayhub-test-gateway',
    audience: 'stayhub-auth-service-test',
    scope: 'auth:invoke',
  },
  outboundServiceJwt: {
    privateKey: 'unused',
    kid: 'test-kid',
    issuer: 'stayhub-auth-service-test',
    audience: 'stayhub-users-service-test',
    scope: 'users:identity',
    ttlSeconds: 60,
  },
  usersServiceUrl: 'http://127.0.0.1:1',
  usersTimeoutMs: 1000,
  usersCircuitFailureThreshold: 5,
  usersCircuitResetMs: 30000,
  accessTokenTtlSeconds: 3600,
  sessionAbsoluteTtlSeconds: 604800,
  refreshTokenHmacSecret: 'test-refresh-token-hmac-secret-0123456789',
  registrationFingerprintSecret: 'test-registration-fingerprint-secret-0123456',
  loginIdentifierHmacSecret: 'test-login-identifier-hmac-secret-0123456789',
  reconciler: { intervalSeconds: 30, ttlSeconds: 900, batchSize: 50, maxAttempts: 5 },
  otlpEndpoint: 'http://127.0.0.1:4318',
  otelServiceName: 'stayhub-auth-service-test',
};

describe('Argon2PasswordHasher (AUTH-052)', () => {
  const hasher = new Argon2PasswordHasher(config);

  it('hashes with Argon2id and verifies the exact password, including Unicode', async (): Promise<void> => {
    const password = 'p ässw🔒8';
    const hash = await hasher.hash(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, password)).resolves.toBe(true);
    await expect(hasher.verify(hash, 'p ässw🔒9')).resolves.toBe(false);
  });

  it('produces a different hash for the same password because of a fresh salt', async (): Promise<void> => {
    const first = await hasher.hash('same-password');
    const second = await hasher.hash('same-password');

    expect(first).not.toBe(second);
    await expect(hasher.verify(first, 'same-password')).resolves.toBe(true);
    await expect(hasher.verify(second, 'same-password')).resolves.toBe(true);
  });

  it('returns false for a malformed hash instead of throwing', async (): Promise<void> => {
    await expect(hasher.verify('not-a-valid-argon2-hash', 'whatever')).resolves.toBe(false);
    await expect(hasher.verify('', 'whatever')).resolves.toBe(false);
  });

  it('uses a decoy hash when no active hash is available', async (): Promise<void> => {
    await expect(hasher.verifyWithEquivalentCost(null, 'anything')).resolves.toBe(false);

    const hash = await hasher.hash('real-password');
    await expect(hasher.verifyWithEquivalentCost(hash, 'real-password')).resolves.toBe(true);
    await expect(hasher.verifyWithEquivalentCost(hash, 'wrong-password')).resolves.toBe(false);
  });
});
