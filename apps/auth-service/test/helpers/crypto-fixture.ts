import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';

import type { AuthConfig } from '@auth/infrastructure/config/auth-config';

export interface RsaKeyPair {
  readonly kid: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

export interface IssueInboundServiceTokenOptions {
  readonly subject?: string;
  readonly scope?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly kid?: string;
  readonly expiresInSeconds?: number;
}

export interface IssueAccessTokenOptions {
  readonly sub?: string;
  readonly sid?: string;
  readonly role?: 'GUEST' | 'OWNER' | 'ADMIN';
  readonly jti?: string;
  readonly kid?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly issuedAt?: number;
  readonly expiresInSeconds?: number;
}

export interface IssueOutboundServiceTokenOptions {
  readonly subject?: string;
  readonly scope?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly kid?: string;
  readonly expiresInSeconds?: number;
}

export interface AuthCryptoFixture {
  readonly config: AuthConfig;
  readonly accessKeys: RsaKeyPair;
  readonly inboundKeys: RsaKeyPair;
  readonly outboundKeys: RsaKeyPair;
  issueInboundServiceToken(options?: IssueInboundServiceTokenOptions): Promise<string>;
  issueAccessToken(options?: IssueAccessTokenOptions): Promise<string>;
  issueOutboundServiceToken(options?: IssueOutboundServiceTokenOptions): Promise<string>;
}

export function createRsaKeyPair(kid: string): RsaKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { kid, publicKey, privateKey };
}

export function createAuthCryptoFixture(overrides: Partial<AuthConfig> = {}): AuthCryptoFixture {
  const accessKeys = createRsaKeyPair('test-access-2026');
  const inboundKeys = createRsaKeyPair('test-gateway-2026');
  const outboundKeys = createRsaKeyPair('test-auth-users-2026');

  const base: AuthConfig = {
    environment: 'test',
    port: 3001,
    databaseUrl: 'postgresql://stayhub_auth:test@127.0.0.1:55432/auth_test?schema=public',
    redisUrl: 'redis://:test@127.0.0.1:56379/15',
    argon2: { memoryCost: 8192, timeCost: 2, parallelism: 1 },
    accessJwt: {
      activeKid: accessKeys.kid,
      privateKey: accessKeys.privateKey,
      publicKeys: { [accessKeys.kid]: accessKeys.publicKey },
      issuer: 'https://auth.stayhub.test',
      audience: 'stayhub-api',
    },
    inboundServiceJwt: {
      publicKeys: { [inboundKeys.kid]: inboundKeys.publicKey },
      issuer: 'stayhub-test-gateway',
      audience: 'stayhub-auth-service-test',
      scope: 'auth:invoke',
    },
    outboundServiceJwt: {
      privateKey: outboundKeys.privateKey,
      kid: outboundKeys.kid,
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

  const config: AuthConfig = { ...base, ...overrides };

  const issueInboundServiceToken = async (
    options: IssueInboundServiceTokenOptions = {},
  ): Promise<string> => {
    const kid = options.kid ?? inboundKeys.kid;
    const issuedAt = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(inboundKeys.privateKey, 'RS256');
    return new SignJWT({ scope: options.scope ?? config.inboundServiceJwt.scope })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setSubject(options.subject ?? 'test-gateway')
      .setIssuer(options.issuer ?? config.inboundServiceJwt.issuer)
      .setAudience(options.audience ?? config.inboundServiceJwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + (options.expiresInSeconds ?? 60))
      .sign(key);
  };

  const issueAccessToken = async (options: IssueAccessTokenOptions = {}): Promise<string> => {
    const kid = options.kid ?? accessKeys.kid;
    const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
    const key = await importPKCS8(accessKeys.privateKey, 'RS256');
    return new SignJWT({ sid: options.sid ?? randomUUID(), role: options.role ?? 'GUEST' })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setSubject(options.sub ?? randomUUID())
      .setJti(options.jti ?? randomUUID())
      .setIssuer(options.issuer ?? config.accessJwt.issuer)
      .setAudience(options.audience ?? config.accessJwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + (options.expiresInSeconds ?? 3600))
      .sign(key);
  };

  const issueOutboundServiceToken = async (
    options: IssueOutboundServiceTokenOptions = {},
  ): Promise<string> => {
    const kid = options.kid ?? outboundKeys.kid;
    const issuedAt = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(outboundKeys.privateKey, 'RS256');
    return new SignJWT({ scope: options.scope ?? config.outboundServiceJwt.scope })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setSubject(options.subject ?? 'auth-service')
      .setIssuer(options.issuer ?? config.outboundServiceJwt.issuer)
      .setAudience(options.audience ?? config.outboundServiceJwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + (options.expiresInSeconds ?? 60))
      .sign(key);
  };

  return {
    config,
    accessKeys,
    inboundKeys,
    outboundKeys,
    issueInboundServiceToken,
    issueAccessToken,
    issueOutboundServiceToken,
  };
}
