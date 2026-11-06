import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { authApp } from '../fixtures/auth-app.fixture';
import { forgeToken, token, validClaims, validHeader } from '../fixtures/config.fixture';

const now = (): number => Math.floor(Date.now() / 1000);

describe('ACC-013 JWT RS256 hardening', () => {
  let app: INestApplication; let server: Server;
  beforeAll(async () => { ({ app, server } = await authApp()); });
  afterAll(async () => { await app.close(); });

  const call = (authorization?: string): request.Test => {
    const req = request(server).post('/probe/owner');
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };

  it('accepts a valid RS256 OWNER token and exposes only sub and role', async () => {
    const sub = randomUUID();
    const res = await call(`Bearer ${forgeToken(validHeader(), validClaims({ sub, sid: randomUUID(), email: 'person@example.test' }))}`).expect(200);
    expect(res.body).toEqual({ sub, role: 'OWNER' });
  });

  it('accepts the token produced by a standard RS256 signer with the expected kid', async () => {
    await call(`Bearer ${token()}`).expect(200);
  });

  const rejected: [string, () => string | undefined][] = [
    ['missing Authorization header', (): string | undefined => undefined],
    ['non-bearer scheme', (): string | undefined => `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['empty bearer', (): string | undefined => 'Bearer '],
    ['bearer with extra segments', (): string | undefined => `Bearer ${token()} extra`],
    ['malformed token', (): string | undefined => 'Bearer not-a-jwt'],
    ['kid absent', (): string | undefined => `Bearer ${forgeToken({ alg: 'RS256', typ: 'JWT' }, validClaims())}`],
    ['kid incorrect', (): string | undefined => `Bearer ${forgeToken(validHeader({ kid: 'access-v2' }), validClaims())}`],
    ['kid not a string', (): string | undefined => `Bearer ${forgeToken(validHeader({ kid: 1 }), validClaims())}`],
    ['alg none', (): string | undefined => `Bearer ${forgeToken(validHeader({ alg: 'none' }), validClaims(), 'none')}`],
    ['alg HS256 signed with the public key', (): string | undefined => `Bearer ${forgeToken(validHeader({ alg: 'HS256' }), validClaims(), 'hs256-public-key')}`],
    ['header claims RS256 but signature is empty', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims(), 'none')}`],
    ['signed by a foreign key', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims(), 'foreign-key')}`],
    ['exp absent', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ exp: undefined }))}`],
    ['exp in the past', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iat: now() - 120, exp: now() - 1 }))}`],
    ['exp equal to now', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iat: now() - 60, exp: now() }))}`],
    ['exp not an integer', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ exp: now() + 60.5 }))}`],
    ['exp as string', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ exp: String(now() + 60) }))}`],
    ['iat absent', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iat: undefined }))}`],
    ['iat in the future', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iat: now() + 120, exp: now() + 3600 }))}`],
    ['iat not an integer', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iat: now() - 0.5 }))}`],
    ['iat as string', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iat: String(now()) }))}`],
    ['exp not after iat', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iat: now(), exp: now() }))}`],
    ['issuer mismatch', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iss: 'other-auth' }))}`],
    ['issuer absent', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ iss: undefined }))}`],
    ['audience mismatch', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ aud: 'other-api' }))}`],
    ['audience absent', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ aud: undefined }))}`],
    ['sub absent', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ sub: undefined }))}`],
    ['sub not a UUID', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ sub: 'owner-1' }))}`],
    ['sub not canonical lowercase', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ sub: randomUUID().toUpperCase() }))}`],
    ['role absent', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ role: undefined }))}`],
    ['role unknown', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ role: 'SUPERUSER' }))}`],
    ['role with different case', (): string | undefined => `Bearer ${forgeToken(validHeader(), validClaims({ role: 'owner' }))}`],
  ];

  it.each(rejected)('rejects %s with 401 Problem Details', async (_case, authorization) => {
    const res = await call(authorization()).expect(401).expect('Content-Type', /application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 401, code: 'HTTP_401', errors: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ|Bearer|kid|exp|iat|issuer|audience/i);
  });
});
