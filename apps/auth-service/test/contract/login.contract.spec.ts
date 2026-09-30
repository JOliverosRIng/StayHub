import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { importPKCS8, SignJWT } from 'jose';
import request from 'supertest';

import {
  LOGIN_USE_CASE,
  type IssuedTokenPair,
  type LoginCommand,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import {
  DependencyUnavailableError,
  InvalidCredentialsError,
  LoginRateLimitError,
} from '@auth/application/errors/auth-errors';
import type { InternalTokenPairResponse } from '@auth/interfaces/http/dto/login.dto';
import { LoginController } from '@auth/interfaces/http/login.controller';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';
import { createRsaKeyPair, type IssueInboundServiceTokenOptions } from '../helpers/crypto-fixture';

const systemClock: Clock = { now: (): Date => new Date() };
const PASSWORD = 'Correct-Horse-Battery-Staple-42';
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

type ExecuteMock = jest.Mock<Promise<IssuedTokenPair>, [LoginCommand]>;

function issuedPair(role: 'GUEST' | 'OWNER' | 'ADMIN' = 'GUEST'): IssuedTokenPair {
  return {
    accessToken: 'header.access.payload.signature',
    refreshToken: 'raw-refresh-token-value-0123456789abcdef',
    expiresIn: 3600,
    absoluteExpiresAt: ABSOLUTE_EXPIRY,
    principal: { userId: randomUUID(), sessionId: randomUUID(), role },
  };
}

function serverOf(target: AuthTestApp): Server {
  return target.app.getHttpServer() as Server;
}

function postLogin(
  target: AuthTestApp,
  body: unknown,
  init: { readonly token?: string; readonly traceId?: string } = {},
): request.Test {
  let call = request(serverOf(target)).post('/internal/v1/login');
  if (init.token !== undefined) {
    call = call.set('authorization', `Bearer ${init.token}`);
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

describe('login HTTP contract (AUTH-049)', () => {
  let application: AuthTestApp | null = null;
  let execute: ExecuteMock;

  afterEach(async (): Promise<void> => {
    if (application !== null) {
      await application.close();
      application = null;
    }
  });

  async function open(): Promise<void> {
    execute = jest.fn<Promise<IssuedTokenPair>, [LoginCommand]>();
    application = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: systemClock },
        { provide: LOGIN_USE_CASE, useValue: { execute } },
      ],
      controllers: [LoginController],
    });
  }

  function app(): AuthTestApp {
    if (application === null) {
      throw new Error('The test application is not initialized');
    }
    return application;
  }

  describe('successful login', () => {
    it.each(['GUEST', 'OWNER', 'ADMIN'] as const)(
      'returns 200 with the full InternalTokenPair for %s',
      async (role): Promise<void> => {
        await open();
        const pair = issuedPair(role);
        execute.mockResolvedValue(pair);
        const token = await app().fixture.issueInboundServiceToken();

        const response = await postLogin(
          app(),
          { email: 'jane.doe@example.test', password: PASSWORD },
          { token },
        );

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
            role,
          },
        });
        expect(Number.isInteger(body.expiresIn)).toBe(true);
        expect(new Date(body.absoluteExpiresAt).toISOString()).toBe(
          pair.absoluteExpiresAt.toISOString(),
        );
        expect(body.principal.userId).toMatch(UUID_PATTERN);
        expect(body.principal.sessionId).toMatch(UUID_PATTERN);
        expect(response.headers['set-cookie']).toBeUndefined();
      },
    );

    it('forwards the exact email, password and traceId to the use case', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue(issuedPair());
      const token = await app().fixture.issueInboundServiceToken();
      const traceId = 'trace-login-12345678';

      await postLogin(
        app(),
        { email: 'Jane.Doe@Example.test', password: PASSWORD },
        { token, traceId },
      );

      expect(execute).toHaveBeenCalledWith({
        email: 'Jane.Doe@Example.test',
        password: PASSWORD,
        traceId,
      });
    });

    it('transmits a password with spaces and Unicode exactly', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue(issuedPair());
      const token = await app().fixture.issueInboundServiceToken();
      const password = 'p ässw🔒8';

      await postLogin(app(), { email: 'jane.doe@example.test', password }, { token });

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ password }),
      );
    });

    it('accepts an email with outer whitespace trimmed before the use case', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue(issuedPair());
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postLogin(
        app(),
        { email: '  jane.doe@example.test  ', password: PASSWORD },
        { token },
      );

      expect(response.status).toBe(200);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jane.doe@example.test' }),
      );
    });
  });

  describe('400 validation before the use case', () => {
    const validBody = { email: 'jane.doe@example.test', password: PASSWORD };
    const cases = [
      { name: 'a role field', body: { ...validBody, role: 'ADMIN' } },
      { name: 'a userId field', body: { ...validBody, userId: randomUUID() } },
      { name: 'an unknown field', body: { ...validBody, admin: true } },
      { name: 'a null email', body: { ...validBody, email: null } },
      { name: 'a malformed email', body: { ...validBody, email: 'not-an-email' } },
      { name: 'a missing password', body: { email: validBody.email } },
      { name: 'a null password', body: { ...validBody, password: null } },
      { name: 'a numeric password', body: { ...validBody, password: 12345678 } },
      { name: 'a password longer than 128', body: { ...validBody, password: 'a'.repeat(129) } },
    ];

    it.each(cases)('rejects $name with a problem+json 400', async ({ body }): Promise<void> => {
      await open();
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postLogin(app(), body, { token });

      expectProblem(response, 'VALIDATION_FAILED', 400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('401 generic authentication failure', () => {
    it('returns an identical problem for missing identity, wrong password and inactive account', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new InvalidCredentialsError());
      const token = await app().fixture.issueInboundServiceToken();
      const traceId = 'trace-invalid-12345678';

      const missing = await postLogin(
        app(),
        { email: 'missing@example.test', password: PASSWORD },
        { token, traceId },
      );
      const wrong = await postLogin(
        app(),
        { email: 'jane.doe@example.test', password: 'wrong-password' },
        { token, traceId },
      );
      const inactive = await postLogin(
        app(),
        { email: 'inactive@example.test', password: PASSWORD },
        { token, traceId },
      );

      expectProblem(missing, 'INVALID_CREDENTIALS', 401);
      expect(missing.body).toEqual(wrong.body);
      expect(missing.body).toEqual(inactive.body);
      expect(missing.headers['x-trace-id']).toBe(traceId);
    });
  });

  describe('rate limiting', () => {
    it('maps the rate limit error to a problem+json 429', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new LoginRateLimitError(900));
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postLogin(
        app(),
        { email: 'jane.doe@example.test', password: PASSWORD },
        { token },
      );

      expectProblem(response, 'LOGIN_RATE_LIMITED', 429);
      expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    });

    it('sets an integer Retry-After header >= 1', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new LoginRateLimitError(900));
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postLogin(
        app(),
        { email: 'jane.doe@example.test', password: PASSWORD },
        { token },
      );

      expect(response.status).toBe(429);
      const retryAfter = Number(response.headers['retry-after']);
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dependency and service authentication', () => {
    it('maps an unavailable dependency to a problem+json 503', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new DependencyUnavailableError('users'));
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postLogin(
        app(),
        { email: 'jane.doe@example.test', password: PASSWORD },
        { token },
      );

      expectProblem(response, 'DEPENDENCY_UNAVAILABLE', 503);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rejects a request without a bearer token', async (): Promise<void> => {
      await open();

      const response = await postLogin(app(), {
        email: 'jane.doe@example.test',
        password: PASSWORD,
      });

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

      const response = await postLogin(
        app(),
        { email: 'jane.doe@example.test', password: PASSWORD },
        { token },
      );

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

      const response = await postLogin(
        app(),
        { email: 'jane.doe@example.test', password: PASSWORD },
        { token },
      );

      expectProblem(response, 'HTTP_401', 401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('never leaks the raw request password in an error problem', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new InvalidCredentialsError());
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postLogin(
        app(),
        { email: 'jane.doe@example.test', password: PASSWORD },
        { token },
      );

      expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
      expect(JSON.stringify(response.body)).not.toContain('jane.doe@example.test');
    });
  });
});
