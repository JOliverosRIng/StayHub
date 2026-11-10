import type { Request } from 'express';
import { exportSPKI, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import { ServiceJwtVerifier } from '@reviews/infrastructure/security/service-jwt.verifier';
import { extractSingleBearer } from '@reviews/interfaces/http/auth/bearer-token';

const SUBJECT = '00000000-0000-4000-8000-000000000001';
const SESSION = '00000000-0000-4000-8000-000000000002';
const JTI = '00000000-0000-4000-8000-000000000003';

describe('Reviews JWT security', () => {
  let privateKey: KeyLike; let publicKey: string; let config: ReviewsConfig;
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { modulusLength: 2048 }); privateKey = pair.privateKey; publicKey = await exportSPKI(pair.publicKey);
    config = {
      nodeEnv: 'test', port: 3007, databaseUrl: 'postgresql://x:x@localhost:5432/x',
      userJwt: { publicKeys: { key: publicKey }, issuer: 'stayhub-auth', audience: 'stayhub-api' },
      gatewayJwt: { publicKeys: { key: publicKey }, issuer: 'stayhub-gateway', audience: 'stayhub-reviews-service', scope: 'reviews:read' },
      bookingsBaseUrl: 'http://bookings:3005', bookingsTimeoutMs: 1000, bookingsServiceToken: 'token', shutdownGraceMs: 1000, logLevel: 'silent', otlpEndpoint: 'http://otel:4318',
    };
  });

  const sign = async (claims: Record<string, unknown>, issuer = 'stayhub-auth', audience = 'stayhub-api', kid = 'key', subject = SUBJECT): Promise<string> => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid }).setIssuer(issuer).setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(privateKey);

  it('accepts a complete RS256 user principal', async () => {
    const token = await sign({ role: 'GUEST', sid: SESSION, jti: JTI }); await expect(new UserJwtVerifier(config).verify(token)).resolves.toMatchObject({ sub: SUBJECT, role: 'GUEST', sid: SESSION, jti: JTI });
  });
  it('requires issuer, audience, kid, role and UUID claims', async () => {
    await expect(new UserJwtVerifier(config).verify(await sign({ role: 'GUEST' }, 'wrong'))).rejects.toThrow('Invalid bearer token');
    await expect(new UserJwtVerifier(config).verify(await sign({ role: 'GUEST' }, 'stayhub-auth', 'wrong'))).rejects.toThrow();
    await expect(new UserJwtVerifier(config).verify(await sign({ role: 'GUEST' }, 'stayhub-auth', 'stayhub-api', 'unknown'))).rejects.toThrow();
    await expect(new UserJwtVerifier(config).verify(await sign({ sid: 'not-uuid' }))).rejects.toThrow();
  });
  it('rejects missing/expired temporal claims, future iat and unsupported algorithms', async () => {
    const missingExp = await new SignJWT({ role: 'GUEST' }).setProtectedHeader({ alg: 'RS256', kid: 'key' }).setIssuer('stayhub-auth').setAudience('stayhub-api').setSubject(SUBJECT).setIssuedAt().sign(privateKey);
    await expect(new UserJwtVerifier(config).verify(missingExp)).rejects.toThrow();
    const expired = await new SignJWT({ role: 'GUEST' }).setProtectedHeader({ alg: 'RS256', kid: 'key' }).setIssuer('stayhub-auth').setAudience('stayhub-api').setSubject(SUBJECT).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 100).sign(privateKey);
    await expect(new UserJwtVerifier(config).verify(expired)).rejects.toThrow();
    const future = await new SignJWT({ role: 'GUEST', iat: Math.floor(Date.now() / 1000) + 3600, exp: Math.floor(Date.now() / 1000) + 7200 }).setProtectedHeader({ alg: 'RS256', kid: 'key' }).setIssuer('stayhub-auth').setAudience('stayhub-api').setSubject(SUBJECT).sign(privateKey);
    await expect(new UserJwtVerifier(config).verify(future)).rejects.toThrow();
    await expect(new UserJwtVerifier(config).verify('eyJhbGciOiJIUzI1NiIsImtpZCI6ImtleSJ9.e30.invalid')).rejects.toThrow('Unsupported token header');
  });
  it('requires the Gateway scope with its own issuer and audience', async () => {
    const valid = await sign({ scope: 'reviews:read' }, 'stayhub-gateway', 'stayhub-reviews-service', 'key', 'api-gateway');
    await expect(new ServiceJwtVerifier(config).verify(valid)).resolves.toMatchObject({ sub: 'api-gateway', scopes: ['reviews:read'] });
    const wrong = await sign({ scope: 'bookings:invoke' }, 'stayhub-gateway', 'stayhub-reviews-service', 'key', 'api-gateway'); await expect(new ServiceJwtVerifier(config).verify(wrong)).rejects.toThrow();
    const unsafeSubject = await sign({ scope: 'reviews:read' }, 'stayhub-gateway', 'stayhub-reviews-service', 'key', '../gateway'); await expect(new ServiceJwtVerifier(config).verify(unsafeSubject)).rejects.toThrow();
  });
  it('rejects duplicate or spoofed Authorization headers before verification', () => {
    const duplicate = { rawHeaders: ['Authorization', 'Bearer a', 'Authorization', 'Bearer b'], headers: { authorization: 'Bearer a, Bearer b' } } as Request;
    expect(() => extractSingleBearer(duplicate)).toThrow();
    const spoofed = { rawHeaders: ['x-user-id', SUBJECT], headers: {} } as unknown as Request; expect(() => extractSingleBearer(spoofed)).toThrow();
  });
});
