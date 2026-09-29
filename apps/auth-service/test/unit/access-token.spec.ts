import { randomUUID } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, importPKCS8, SignJWT } from 'jose';

import type { AuthConfig } from '@auth/infrastructure/config/auth-config';
import { Rs256TokenService } from '@auth/infrastructure/security/rs256-token.service';
import { FakeClock } from '../helpers/fake-clock';
import { createRsaKeyPair, type RsaKeyPair } from '../helpers/crypto-fixture';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const TTL = 3600;
const ISSUER = 'https://auth.stayhub.test';
const AUDIENCE = 'stayhub-api';

const active = createRsaKeyPair('active-2026');
const previous = createRsaKeyPair('previous-2025');
const foreign = createRsaKeyPair('foreign');

interface TokenOverrides {
  readonly sub?: string;
  readonly sid?: string;
  readonly role?: string;
  readonly jti?: string;
  readonly kid?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly iat?: number;
  readonly exp?: number;
  readonly includeIat?: boolean;
  readonly includeExp?: boolean;
  readonly payloadExtra?: Readonly<Record<string, unknown>>;
}

function baseConfig(accessJwt: AuthConfig['accessJwt']): AuthConfig {
  return {
    environment: 'test',
    port: 3001,
    databaseUrl: 'postgresql://stayhub_auth:test@127.0.0.1:55432/auth_test?schema=public',
    redisUrl: 'redis://:test@127.0.0.1:56379/15',
    argon2: { memoryCost: 8192, timeCost: 2, parallelism: 1 },
    accessJwt,
    inboundServiceJwt: {
      publicKeys: { [active.kid]: active.publicKey },
      issuer: 'stayhub-test-gateway',
      audience: 'stayhub-auth-service-test',
      scope: 'auth:invoke',
    },
    outboundServiceJwt: {
      privateKey: active.privateKey,
      kid: active.kid,
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
}

function serviceWith(
  options: {
    readonly activeKid?: string;
    readonly privateKey?: string;
    readonly publicKeys?: Readonly<Record<string, string>>;
  } = {},
): Rs256TokenService {
  const accessJwt: AuthConfig['accessJwt'] = {
    activeKid: options.activeKid ?? active.kid,
    privateKey: options.privateKey ?? active.privateKey,
    publicKeys: options.publicKeys ?? { [active.kid]: active.publicKey },
    issuer: ISSUER,
    audience: AUDIENCE,
  };
  return new Rs256TokenService(baseConfig(accessJwt), new FakeClock(NOW));
}

function validClaims(): {
  sub: string;
  sid: string;
  role: 'GUEST';
  jti: string;
} {
  return { sub: randomUUID(), sid: randomUUID(), role: 'GUEST', jti: randomUUID() };
}

async function signWith(pair: RsaKeyPair, overrides: TokenOverrides = {}): Promise<string> {
  const key = await importPKCS8(pair.privateKey, 'RS256');
  const payload: Record<string, unknown> = {
    sub: overrides.sub ?? randomUUID(),
    sid: overrides.sid ?? randomUUID(),
    role: overrides.role ?? 'GUEST',
    jti: overrides.jti ?? randomUUID(),
    ...(overrides.payloadExtra ?? {}),
  };
  const jwt = new SignJWT(payload)
    .setProtectedHeader({
      alg: 'RS256',
      kid: overrides.kid ?? pair.kid,
      typ: 'JWT',
    })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE);
  if (overrides.includeIat !== false) jwt.setIssuedAt(overrides.iat ?? NOW_SECONDS);
  if (overrides.includeExp !== false) jwt.setExpirationTime(overrides.exp ?? NOW_SECONDS + TTL);
  return jwt.sign(key);
}

describe('access token verification (AUTH-053)', () => {
  describe('signing', () => {
    it('signs an RS256 token with canonical claims and a 3600s lifetime', async (): Promise<void> => {
      const service = serviceWith();
      const claims = validClaims();

      const token = await service.signAccessToken(claims);

      const header = decodeProtectedHeader(token);
      expect(header).toMatchObject({ alg: 'RS256', kid: active.kid, typ: 'JWT' });
      const payload = decodeJwt(token);
      expect(payload).toMatchObject({
        ...claims,
        iss: ISSUER,
        aud: AUDIENCE,
        iat: NOW_SECONDS,
        exp: NOW_SECONDS + TTL,
      });
      expect(Object.keys(payload).sort()).toEqual([
        'aud',
        'exp',
        'iat',
        'iss',
        'jti',
        'role',
        'sid',
        'sub',
      ]);
      expect((payload.exp as number) - (payload.iat as number)).toBe(3600);
      expect(payload).not.toHaveProperty('email');
    });

    it('uses the active kid when the key ring rotates', async (): Promise<void> => {
      const service = serviceWith({
        activeKid: active.kid,
        publicKeys: {
          [active.kid]: active.publicKey,
          [previous.kid]: previous.publicKey,
        },
      });

      const token = await service.signAccessToken(validClaims());

      expect(decodeProtectedHeader(token).kid).toBe(active.kid);
    });
  });

  describe('verification success', () => {
    it('returns the canonical claims with numeric iat and exp', async (): Promise<void> => {
      const service = serviceWith();
      const claims = validClaims();

      const verified = await service.verifyAccessToken(await service.signAccessToken(claims));

      expect(verified).toEqual({ ...claims, iat: NOW_SECONDS, exp: NOW_SECONDS + TTL });
      expect(Number.isInteger(verified.iat)).toBe(true);
      expect(Number.isInteger(verified.exp)).toBe(true);
    });
  });

  describe('verification rejects invalid tokens', () => {
    const cases: ReadonlyArray<[string, () => Promise<string>]> = [
      ['a malformed subject', (): Promise<string> => signWith(active, { sub: 'not-a-uuid' })],
      ['an empty subject', (): Promise<string> => signWith(active, { sub: '' })],
      ['a malformed session id', (): Promise<string> => signWith(active, { sid: '12345' })],
      ['an empty token id', (): Promise<string> => signWith(active, { jti: '' })],
      ['an unknown role', (): Promise<string> => signWith(active, { role: 'ROOT' })],
      ['a missing iat', (): Promise<string> => signWith(active, { includeIat: false })],
      ['a missing exp', (): Promise<string> => signWith(active, { includeExp: false })],
      [
        'a non numeric iat',
        (): Promise<string> => signWith(active, { includeIat: false, payloadExtra: { iat: 'not-a-number' } }),
      ],
      [
        'an expired token',
        (): Promise<string> => signWith(active, { iat: NOW_SECONDS - 7200, exp: NOW_SECONDS - 3600 }),
      ],
      [
        'a lifetime different from 3600',
        (): Promise<string> => signWith(active, { iat: NOW_SECONDS, exp: NOW_SECONDS + 60 }),
      ],
      [
        'an issued-in-the-future iat',
        (): Promise<string> => signWith(active, { iat: NOW_SECONDS + 120, exp: NOW_SECONDS + 120 + TTL }),
      ],
      ['a wrong issuer', (): Promise<string> => signWith(active, { issuer: 'https://evil.example' })],
      ['a wrong audience', (): Promise<string> => signWith(active, { audience: 'other-service' })],
      ['an unknown kid', (): Promise<string> => signWith(active, { kid: 'unknown-kid' })],
      ['a foreign signature', (): Promise<string> => signWith(foreign, { kid: active.kid })],
      ['an HS256 token', (): Promise<string> => signHs256()],
    ];

    it.each(cases)('rejects %s', async (_label, factory): Promise<void> => {
      const service = serviceWith();

      await expect(service.verifyAccessToken(await factory())).rejects.toThrow();
    });

    it.each(['not-a-token', '', 'a.b', 'a.b.c.d', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'])(
      'rejects the malformed token %p',
      async (token): Promise<void> => {
        const service = serviceWith();

        await expect(service.verifyAccessToken(token)).rejects.toThrow();
      },
    );
  });

  describe('key ring rotation', () => {
    it('verifies tokens signed with any key still present in the ring', async (): Promise<void> => {
      const service = serviceWith({
        activeKid: active.kid,
        publicKeys: {
          [active.kid]: active.publicKey,
          [previous.kid]: previous.publicKey,
        },
      });

      await expect(service.verifyAccessToken(await signWith(active))).resolves.toMatchObject({
        role: 'GUEST',
      });
      await expect(service.verifyAccessToken(await signWith(previous))).resolves.toMatchObject({
        role: 'GUEST',
      });
    });

    it('rejects a token whose kid was removed from the ring', async (): Promise<void> => {
      const service = serviceWith({
        activeKid: active.kid,
        publicKeys: { [active.kid]: active.publicKey },
      });

      await expect(service.verifyAccessToken(await signWith(previous))).rejects.toThrow();
    });

    it('does not resolve inherited object properties as key ids', async (): Promise<void> => {
      const service = serviceWith();

      await expect(
        service.verifyAccessToken(await signWith(active, { kid: 'toString' })),
      ).rejects.toThrow();
      await expect(
        service.verifyAccessToken(await signWith(active, { kid: '__proto__' })),
      ).rejects.toThrow();
    });
  });
});

async function signHs256(): Promise<string> {
  const secret = new TextEncoder().encode('shared-secret-shared-secret-shared-secret');
  return new SignJWT({ sid: randomUUID(), role: 'GUEST' })
    .setProtectedHeader({ alg: 'HS256', kid: active.kid, typ: 'JWT' })
    .setSubject(randomUUID())
    .setJti(randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(NOW_SECONDS)
    .setExpirationTime(NOW_SECONDS + TTL)
    .sign(secret);
}
