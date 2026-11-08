import { createSign, generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { JwtVerifier } from '../../src/infrastructure/security/jwt.verifier';
import type { NotificationsConfig } from '../../src/infrastructure/config/notifications-config';

describe('JWT hardening (NTF-006)', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = {
    accessJwt: { publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), issuer: 'auth', audience: 'api', kid: 'a1', maxAgeSeconds: 3600 },
    serviceJwt: { publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), issuer: 'svc', audience: 'notifications', kid: 's1', maxAgeSeconds: 300 },
    sendScope: 'notifications:send',
  } as NotificationsConfig;
  const verifier = new JwtVerifier(config);
  const sign = (payload: object, kid: string, issuer: string, audience: string): string => jwt.sign(payload, keys.privateKey, { algorithm: 'RS256', keyid: kid, issuer, audience, expiresIn: '5m' });
  const signRawPayload = (payload: string): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'a1', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(payload).toString('base64url');
    const unsigned = `${header}.${body}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    return `${unsigned}.${signer.sign(keys.privateKey).toString('base64url')}`;
  };

  it('accepts only the configured RS256 access identity and validates subject/role', () => {
    const token = sign({ sub: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', roles: ['ADMIN'] }, 'a1', 'auth', 'api');
    expect(verifier.verifyAccess(token).roles).toEqual(['ADMIN']);
    expect(() => verifier.verifyAccess(sign({ sub: 'not-uuid', role: 'ADMIN' }, 'a1', 'auth', 'api'))).toThrow();
    expect(() => verifier.verifyAccess(sign({ sub: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66' }, 'wrong', 'auth', 'api'))).toThrow();
    const now = Math.floor(Date.now() / 1000);
    const duplicateClaims = signRawPayload(`{"sub":"6b2bf6ea-4d76-4f3e-84a7-5a7857825b66","sub":"6b2bf6ea-4d76-4f3e-84a7-5a7857825b67","iss":"auth","aud":"api","iat":${now},"exp":${now + 300},"roles":["ADMIN"]}`);
    expect(() => verifier.verifyAccess(duplicateClaims)).toThrow();
  });

  it('enforces dedicated service scope', () => {
    const token = sign({ scope: 'notifications:send' }, 's1', 'svc', 'notifications');
    expect(verifier.verifyService(token).tokenType).toBe('service');
    const insufficient = sign({ scope: 'bookings:read' }, 's1', 'svc', 'notifications');
    expect(() => verifier.verifyService(insufficient)).toThrow('Insufficient service scope');
  });
});
