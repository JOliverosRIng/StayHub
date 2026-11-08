import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import { verifyServiceJwt, verifyUserJwt } from '../../src/infrastructure/security/jwt.verifier';
import type { JwtConfig } from '../../src/infrastructure/config/payments-config';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config: JwtConfig = {
  issuer: 'stayhub-auth',
  audience: 'stayhub-payments',
  kid: 'test-key-v1',
  publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
};
const now = 1_800_000_000;
const makeToken = (claims: Record<string, unknown> = {}, options: Record<string, unknown> = {}): string =>
  sign({ iss: config.issuer, aud: config.audience, iat: now, exp: now + 120, ...claims }, keys.privateKey, {
    algorithm: 'RS256', keyid: config.kid, ...options,
  });

describe('Payments JWT verifier', () => {
  it('verifies a service token with scope and RS256 claims', () => {
    const token = makeToken({ sub: 'booking-service', scope: 'payments:charge' });
    expect(verifyServiceJwt(token, config, 300, now).scope).toBe('payments:charge');
  });

  it('verifies user tokens and rejects wrong algorithm, key id, issuer, audience, age, and scope shape', () => {
    const token = makeToken({ sub: 'user-1', sid: 'session-1', jti: 'token-1', role: 'GUEST' });
    expect(verifyUserJwt(token, config, 3600, now).sub).toBe('user-1');

    const wrongAlgorithm = sign({ iss: config.issuer, aud: config.audience, iat: now, exp: now + 120 }, 'shared-secret', {
      algorithm: 'HS256', keyid: config.kid,
    });
    const invalid = [
      wrongAlgorithm,
      makeToken({}, { keyid: 'wrong-kid' }),
      makeToken({ iss: 'wrong-issuer' }),
      makeToken({ aud: 'wrong-audience' }),
      makeToken({ iat: now - 400, exp: now + 30 }),
      makeToken({ iat: now + 10 }),
      makeToken({ scope: '' }),
    ];
    for (const candidate of invalid) {
      expect(() => verifyServiceJwt(candidate, config, 300, now)).toThrow(UnauthorizedException);
    }
  });

  it('rejects malformed tokens without exposing verifier details', () => {
    expect(() => verifyUserJwt('not.a.jwt', config, 3600, now)).toThrow(UnauthorizedException);
  });
});
