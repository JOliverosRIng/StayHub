import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { importPKCS8, SignJWT } from 'jose';
import request from 'supertest';

import {
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
  type ValidateSessionCommand,
  type ValidatedSession,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { DependencyUnavailableError, SessionInvalidError } from '@auth/application/errors/auth-errors';
import { ValidateSessionResponse } from '@auth/interfaces/http/dto/validate-session.dto';
import { SessionsController } from '@auth/interfaces/http/sessions.controller';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';
import { createRsaKeyPair, type IssueInboundServiceTokenOptions } from '../helpers/crypto-fixture';

const systemClock: Clock = { now: (): Date => new Date() };

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

type ExecuteMock = jest.Mock<Promise<ValidatedSession>, [ValidateSessionCommand]>;

function validBody(): { sessionId: string; userId: string } {
  return { sessionId: randomUUID(), userId: randomUUID() };
}

function serverOf(target: AuthTestApp): Server {
  return target.app.getHttpServer() as Server;
}

function postValidate(
  target: AuthTestApp,
  body: unknown,
  init: { readonly token?: string; readonly traceId?: string } = {},
): request.Test {
  let call = request(serverOf(target)).post('/internal/v1/sessions/validate');
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

describe('session validation HTTP contract (AUTH-051)', () => {
  let application: AuthTestApp | null = null;
  let execute: ExecuteMock;

  afterEach(async (): Promise<void> => {
    if (application !== null) {
      await application.close();
      application = null;
    }
  });

  async function open(): Promise<void> {
    execute = jest.fn<Promise<ValidatedSession>, [ValidateSessionCommand]>();
    application = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: systemClock },
        { provide: VALIDATE_SESSION_USE_CASE, useValue: { execute } },
        { provide: ROTATE_REFRESH_TOKEN_USE_CASE, useValue: { execute: jest.fn() } },
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

  describe('successful validation', () => {
    it.each(['GUEST', 'OWNER', 'ADMIN'] as const)(
      'returns 200 with exactly active:true and the authoritative role for %s',
      async (role): Promise<void> => {
        await open();
        execute.mockResolvedValue({ active: true, role });
        const token = await app().fixture.issueInboundServiceToken();
        const body = validBody();
        const traceId = 'trace-validate-12345678';

        const response = await postValidate(app(), body, { token, traceId });

        expect(response.status).toBe(200);
        const responseBody = response.body as ValidateSessionResponse;
        expect(responseBody).toEqual({ active: true, role });
        expect(Object.keys(responseBody).sort()).toEqual(['active', 'role']);
        expect(execute).toHaveBeenCalledWith({
          sessionId: body.sessionId,
          userId: body.userId,
          traceId,
        });
        expect(execute.mock.calls[0]?.[0]).not.toHaveProperty('accessTokenExpiresAt');
        expect(JSON.stringify(responseBody)).not.toContain(body.userId);
        expect(JSON.stringify(responseBody)).not.toContain(body.sessionId);
      },
    );
  });

  describe('400 validation before the use case', () => {
    const body = validBody();
    const cases = [
      { name: 'a missing sessionId', payload: { userId: body.userId } },
      { name: 'a missing userId', payload: { sessionId: body.sessionId } },
      { name: 'a malformed sessionId', payload: { ...body, sessionId: 'not-a-uuid' } },
      { name: 'a malformed userId', payload: { ...body, userId: '12345' } },
      { name: 'a null sessionId', payload: { ...body, sessionId: null } },
      { name: 'a role field', payload: { ...body, role: 'ADMIN' } },
      { name: 'an alternate sid field', payload: { ...body, sid: randomUUID() } },
      { name: 'an accessToken field', payload: { ...body, accessToken: 'header.payload.sig' } },
      { name: 'an exp field', payload: { ...body, exp: Math.floor(Date.now() / 1000) + 3600 } },
      { name: 'an unknown field', payload: { ...body, admin: true } },
    ];

    it.each(cases)('rejects $name with a problem+json 400', async ({ payload }): Promise<void> => {
      await open();
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postValidate(app(), payload, { token });

      expectProblem(response, 'VALIDATION_FAILED', 400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('401 generic invalid session', () => {
    it('returns an identical generic 401 for missing, revoked, expired or mismatched sessions', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new SessionInvalidError());
      const token = await app().fixture.issueInboundServiceToken();
      const traceId = 'trace-invalid-12345678';

      const missing = await postValidate(app(), validBody(), { token, traceId });
      const revoked = await postValidate(app(), validBody(), { token, traceId });
      const expired = await postValidate(app(), validBody(), { token, traceId });
      const mismatched = await postValidate(app(), validBody(), { token, traceId });

      expectProblem(missing, 'SESSION_INVALID', 401);
      expect(missing.body).toEqual(revoked.body);
      expect(missing.body).toEqual(expired.body);
      expect(missing.body).toEqual(mismatched.body);
    });

    it('never returns active:false 200 or a 403 for an internal identity mismatch', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new SessionInvalidError());
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postValidate(app(), validBody(), { token });

      expect(response.status).not.toBe(403);
      expect(response.body).not.toMatchObject({ active: false });
    });
  });

  describe('dependency and service authentication', () => {
    it('maps a database failure to a problem+json 503', async (): Promise<void> => {
      await open();
      execute.mockRejectedValue(new DependencyUnavailableError('database'));
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postValidate(app(), validBody(), { token });

      expectProblem(response, 'DEPENDENCY_UNAVAILABLE', 503);
    });

    it('rejects a request without a bearer token', async (): Promise<void> => {
      await open();

      const response = await postValidate(app(), validBody());

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

      const response = await postValidate(app(), validBody(), { token });

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

      const response = await postValidate(app(), validBody(), { token });

      expectProblem(response, 'HTTP_401', 401);
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
