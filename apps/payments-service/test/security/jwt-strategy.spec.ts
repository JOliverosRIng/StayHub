import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../../src/interfaces/http/auth/jwt.strategy';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const jwt = { issuer: 'auth', audience: 'payments', kid: 'auth-v1', publicKey };
const config = { userJwt: jwt } as PaymentsConfig;
const now = Math.floor(Date.now() / 1000);
const makeRequest = (role: string): Parameters<JwtStrategy['validate']>[0] => {
  const token = sign({
    iss: jwt.issuer,
    aud: jwt.audience,
    sub: '56ac8df3-4ab6-48d2-8248-37ec830c9131',
    sid: 'c23c61c8-1ccb-4c3f-932b-b62505420aae',
    jti: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
    role,
    iat: now,
    exp: now + 120,
  }, keys.privateKey, { algorithm: 'RS256', keyid: jwt.kid });
  return {
    headers: { authorization: `Bearer ${token}` },
    rawHeaders: ['authorization', `Bearer ${token}`],
  } as Parameters<JwtStrategy['validate']>[0];
};

describe('Payments JwtStrategy', () => {
  it('returns only a validated user principal', () => {
    expect(new JwtStrategy(config).validate(makeRequest('GUEST'))).toEqual({
      sub: '56ac8df3-4ab6-48d2-8248-37ec830c9131',
      sid: 'c23c61c8-1ccb-4c3f-932b-b62505420aae',
      jti: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
      role: 'GUEST',
    });
  });

  it('rejects a principal with an unsupported role', () => {
    expect(() => new JwtStrategy(config).validate(makeRequest('SERVICE'))).toThrow(UnauthorizedException);
  });
});
