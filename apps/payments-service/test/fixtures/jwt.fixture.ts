import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { sign, type SignOptions } from 'jsonwebtoken';
import type { JwtConfig } from '../../src/infrastructure/config/payments-config';

export interface TestJwtFixture {
  readonly config: JwtConfig;
  readonly privateKey: KeyObject;
  signToken(claims?: Readonly<Record<string, unknown>>, options?: SignOptions): string;
}

export function createTestJwtFixture(
  overrides: Partial<Pick<JwtConfig, 'issuer' | 'audience' | 'kid'>> = {},
): TestJwtFixture {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config: JwtConfig = {
    issuer: overrides.issuer ?? 'stayhub-test-issuer',
    audience: overrides.audience ?? 'stayhub-payments-test',
    kid: overrides.kid ?? 'payments-test-v1',
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };

  return {
    config,
    privateKey: keys.privateKey,
    signToken: (claims = {}, options = {}): string => {
      const now = Math.floor(Date.now() / 1000);
      return sign({ iss: config.issuer, aud: config.audience, iat: now, exp: now + 120, ...claims }, keys.privateKey, {
        algorithm: 'RS256',
        keyid: config.kid,
        ...options,
      });
    },
  };
}
