import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { importPKCS8, SignJWT } from 'jose';
import request from 'supertest';

import {
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
  type IssuedTokenPair,
  type RotateRefreshCommand,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import {
  DependencyUnavailableError,
  RefreshTokenInvalidError,
} from '@auth/application/errors/auth-errors';
import { InternalTokenPairResponse } from '@auth/interfaces/http/dto/login.dto';
import { SessionsController } from '@auth/interfaces/http/sessions.controller';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';
import { createRsaKeyPair, type IssueInboundServiceTokenOptions } from '../helpers/crypto-fixture';

const systemClock: Clock = { now: (): Date => new Date() };
const RAW_REFRESH = 'raw-refresh-token-value-0123456789abcdef';
const ABSOLUTE_EXPIRY = new Date('2026-10-05T00:00:00.000Z');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly traceId: string;
  readonly errors?: readonly string[];
}

type ExecuteMock = jest.Mock<Promise<IssuedTokenPair>, [RotateRefreshCommand]>;

function issuedPair(): IssuedTokenPair {
  return {
    accessToken: 'header.access.payload.signature',
    refreshToken: 'next-raw-refresh-token-value-0123456789',
    expiresIn: 3600,
    absoluteExpiresAt: ABSOLUTE_EXPIRY,
    principal: { userId: randomUUID(), sessionId: randomUUID(), role: 'GUEST' },
  };
}

function serverOf(target: AuthTestApp): Server {
  return target.app.getHttpServer() as Server;
}

function postRefresh(
  target: AuthTestApp,
  body: unknown,
  init: { readonly token?: string; readonly traceId?: string; readonly cookie?: string } = {},
): request.Test {
  let call = request(serverOf(target)).post('/internal/v1/sessions/refresh');
  if (init.token !== undefined) {
    call = call.set('authorization', `Bearer ${init.token}`);
  }
  if (init.cookie !== undefined) {
    call = call.set('cookie', init.cookie);
  }
  if (init.traceId !== undefined) {
    call = call.set('x-trace-id', init.traceId);
  }
  return call.send(body as object);
}

function expectProblem(response: request.Response, code: string, status: number): void {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  const body = response.body as ProblemBody;
  expect(body).toMatchObject({ status, code });
  expect(body.type).toContain(code.toLowerCase().replaceAll('_', '-'));
  expect(typeof body.traceId).toBe('string');
}

describe('refresh HTTP contract (AUTH-050)', () => {
  let application: AuthTestApp | null = null;
  let execute: ExecuteMock;

  afterEach(async (): Promise<void> => {
    if (application !== null) {
      await application.close();
      application = null;
    }
  });

  async function open(): Promise<void> {
    execute = jest.fn<Promise<IssuedTokenPair>, [RotateRefreshCommand]>();
    application = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: systemClock },
        { provide: ROTATE_REFRESH_TOKEN_USE_CASE, useValue: { execute } },
        { provide: VALIDATE_SESSION_USE_CASE, useValue: { execute: jest.fn() } },
      ],
      controllers: [SessionsController],
    });
  }

  function app(): AuthTestApp {
    if (application === null) {
      throw new Error('The test application is not initialized');
    }
    return application;
  }

  describe('successful rotation', () => {
    it('returns 200 with the rotated InternalTokenPair and no cookie', async (): Promise<void> => {
      await open();
      const pair = issuedPair();
      execute.mockResolvedValue(pair);
      const token = await app().fixture.issueInboundServiceToken();
      const traceId = 'trace-refresh-12345678';

      const response = await postRefresh(app(), { refreshToken: RAW_REFRESH }, { token, traceId });

      expect(response.status).toBe(200);
      const body = response.body as InternalTokenPairResponse;
      expect(body).toEqual({
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        expiresIn: 3600,
        absoluteExpiresAt: pair.absoluteExpiresAt.toISOString(),
        principal: {
          userId: pair.principal.userId,
          sessionId: pair.principal.sessionId,
          role: 'GUEST',
        },
      });
      expect(Number.isInteger(body.expiresIn)).toBe(true);
      expect(body.principal.userId).toMatch(UUID_PATTERN);
      expect(body.principal.sessionId).toMatch(UUID_PATTERN);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(execute).toHaveBeenCalledWith({ refreshToken: RAW_REFRESH, traceId });
    });

    it('accepts a valid JSON body without any cookie header', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue(issuedPair());
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postRefresh(app(), { refreshToken: RAW_REFRESH }, { token });

      expect(response.status).toBe(200);
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('400 validation before the use case', () => {
    const cases = [
      { name: 'a missing refreshToken', body: {} },
      { name: 'a null refreshToken', body: { refreshToken: null } },
      { name: 'a numeric refreshToken', body: { refreshToken: 12345 } },
      { name: 'a refreshToken shorter than 32', body: { refreshToken: 'a'.repeat(31) } },
      { name: 'an unknown field', body: { refreshToken: RAW_REFRESH, userId: randomUUID() } },
      { name: 'a role field', body: { refreshToken: RAW_REFRESH, role: 'ADMIN' } },
    ];

    it.each(cases)('rejects $name with a problem+json 400', async ({ body }): Promise<void> => {
      await open();
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postRefresh(app(), body, { token });

      expectProblem(response, 'VALIDATION_FAILED', 400);
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a cookie-only request because the internal contract uses the body', async (): Promise<void> => {
      await open();
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postRefresh(
        app(),
        {},
        { token, cookie: `refreshToken=${RAW_REFRESH}` },
      );

      expectProblem(response, 'VALIDATION_FAILED', 400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('401 invalid refresh token', () => {
    it.each(['unknown', 'expired', 'consumed', 'revoked'])(
      'returns a generic 401 for a %s token',
      async (state: string): Promise<void> => {
        await open();
        execute.mockRejectedValue(new RefreshTokenInvalidError());
        const token = await app().fixture.issueInboundServiceToken();
        const traceId = `trace-${state}-12345678`;

        const response = await postRefresh(app(), { refreshToken: RAW_REFRESH }, { token, traceId });

        expectProblem(response, 'REFRESH_TOKEN_INVALID', 401);
        expect(response.headers['x-trace-id']).toBe(traceId);
        expect(JSON.stringify(response.body)).not.toContain(RAW_REFRESH);
      },
    );

    it('distinguishes shape 400 from a syntactically valid but rejected 401', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new RefreshTokenInvalidError());
      const token = await app().fixture.issueInboundServiceToken();

      const short = await postRefresh(app(), { refreshToken: 'too-short' }, { token });
      const unknown = await postRefresh(app(), { refreshToken: RAW_REFRESH }, { token });

      expectProblem(short, 'VALIDATION_FAILED', 400);
      expectProblem(unknown, 'REFRESH_TOKEN_INVALID', 401);
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('dependency and service authentication', () => {
    it('maps a persistence failure to a problem+json 503', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new DependencyUnavailableError('database'));
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postRefresh(app(), { refreshToken: RAW_REFRESH }, { token });

      expectProblem(response, 'DEPENDENCY_UNAVAILABLE', 503);
      expect(JSON.stringify(response.body)).not.toContain(RAW_REFRESH);
    });

    it('rejects a request without a bearer token', async (): Promise<void> => {
      await open();

      const response = await postRefresh(app(), { refreshToken: RAW_REFRESH });

      expectProblem(response, 'HTTP_401', 401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a token signed with a foreign key', async (): Promise<void> => {
      await open();
      const foreign = createRsaKeyPair('foreign');
      const key = await importPKCS8(foreign.privateKey, 'RS256');
      const issuedAt = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ scope: 'auth:invoke' })
        .setProtectedHeader({ alg: 'RS256', kid: app().fixture.inboundKeys.kid, typ: 'JWT' })
        .setSubject('test-gateway')
        .setIssuer(app().fixture.config.inboundServiceJwt.issuer)
        .setAudience(app().fixture.config.inboundServiceJwt.audience)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + 60)
        .sign(key);

      const response = await postRefresh(app(), { refreshToken: RAW_REFRESH }, { token });

      expectProblem(response, 'HTTP_401', 401);
      expect(execute).not.toHaveBeenCalled();
    });

    const rejected: ReadonlyArray<[string, IssueInboundServiceTokenOptions]> = [
      ['a wrong issuer', { issuer: 'https://evil.example' }],
      ['a wrong audience', { audience: 'other-service' }],
      ['an insufficient scope', { scope: 'users:identity' }],
      ['an expired token', { expiresInSeconds: -10 }],
    ];

    it.each(rejected)('rejects %s', async (_label, options): Promise<void> => {
      await open();
      const token = await app().fixture.issueInboundServiceToken(options);

      const response = await postRefresh(app(), { refreshToken: RAW_REFRESH }, { token });

      expectProblem(response, 'HTTP_401', 401);
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
