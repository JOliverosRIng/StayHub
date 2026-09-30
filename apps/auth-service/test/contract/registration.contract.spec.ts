import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { type Type } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import request from 'supertest';

import {
  REGISTER_ACCOUNT_USE_CASE,
  type RegisterAccountCommand,
  type RegisterAccountResult,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  RegistrationCancelledError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';
import { createRsaKeyPair, type IssueInboundServiceTokenOptions } from '../helpers/crypto-fixture';

const systemClock: Clock = { now: (): Date => new Date() };
const PASSWORD = 'Correct-Horse-Battery-Staple-42';

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

interface RegisterRequestInput {
  name: string;
  email: string;
  password: string;
  role: 'GUEST' | 'OWNER';
}

type ExecuteMock = jest.Mock<Promise<RegisterAccountResult>, [RegisterAccountCommand]>;

function validBody(overrides: Partial<RegisterRequestInput> = {}): RegisterRequestInput {
  return {
    name: 'Jane Guest',
    email: 'jane.guest@example.test',
    password: PASSWORD,
    role: 'GUEST',
    ...overrides,
  };
}

function serverOf(target: AuthTestApp): Server {
  return target.app.getHttpServer() as Server;
}

function postRegistration(
  target: AuthTestApp,
  body: unknown,
  init: {
    readonly token?: string;
    readonly idempotencyKey?: string | null;
    readonly traceId?: string;
  } = {},
): request.Test {
  let call = request(serverOf(target)).post('/internal/v1/registrations');
  if (init.token !== undefined) {
    call = call.set('authorization', `Bearer ${init.token}`);
  }
  if (init.idempotencyKey !== undefined && init.idempotencyKey !== null) {
    call = call.set('idempotency-key', init.idempotencyKey);
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

describe('registration HTTP contract (AUTH-026)', () => {
  let application: AuthTestApp | null = null;
  let execute: ExecuteMock;

  afterEach(async (): Promise<void> => {
    if (application !== null) {
      await application.close();
      application = null;
    }
  });

  async function open(
    controllers: readonly Type<unknown>[] = [RegistrationController],
  ): Promise<void> {
    execute = jest.fn<Promise<RegisterAccountResult>, [RegisterAccountCommand]>();
    application = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: systemClock },
        { provide: REGISTER_ACCOUNT_USE_CASE, useValue: { execute } },
      ],
      controllers,
    });
  }

  function app(): AuthTestApp {
    if (application === null) {
      throw new Error('The test application is not initialized');
    }
    return application;
  }

  describe('successful registration', () => {
    it.each(['GUEST', 'OWNER'] as const)(
      'returns 201 and only id/name/email/role for %s',
      async (role): Promise<void> => {
        await open();
        const id = randomUUID();
        execute.mockResolvedValue({
          id,
          name: 'Jane Guest',
          email: 'jane.guest@example.test',
          role,
        });
        const token = await app().fixture.issueInboundServiceToken();
        const key = randomUUID();

        const response = await postRegistration(app(), validBody({ role }), {
          token,
          idempotencyKey: key,
        });

        expect(response.status).toBe(201);
        const body = response.body as Record<string, unknown>;
        expect(body).toEqual({ id, name: 'Jane Guest', email: 'jane.guest@example.test', role });
        expect(Object.keys(body).sort()).toEqual(['email', 'id', 'name', 'role']);
        expect(execute).toHaveBeenCalledWith({
          idempotencyKey: key,
          input: {
            name: 'Jane Guest',
            email: 'jane.guest@example.test',
            password: PASSWORD,
            role,
          },
          traceId: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/) as unknown as string,
        });
      },
    );

    it('forwards the request traceId and the idempotency key to the use case', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue({
        id: randomUUID(),
        name: 'Jane Guest',
        email: 'jane.guest@example.test',
        role: 'GUEST',
      });
      const token = await app().fixture.issueInboundServiceToken();
      const key = randomUUID();
      const traceId = 'trace-reg-12345678';

      await postRegistration(app(), validBody(), { token, idempotencyKey: key, traceId });

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: key, traceId }),
      );
    });

    it('transmits a password with spaces and Unicode exactly', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue({
        id: randomUUID(),
        name: 'Jane Guest',
        email: 'jane.guest@example.test',
        role: 'GUEST',
      });
      const token = await app().fixture.issueInboundServiceToken();
      const password = 'p ässw🔒8';

      await postRegistration(app(), validBody({ password }), {
        token,
        idempotencyKey: randomUUID(),
      });

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ password }) as unknown,
        }),
      );
    });

    it.each([8, 128])(
      'transmits a %i code point password exactly',
      async (length): Promise<void> => {
        await open();
        execute.mockResolvedValue({
          id: randomUUID(),
          name: 'Jane Guest',
          email: 'jane.guest@example.test',
          role: 'GUEST',
        });
        const token = await app().fixture.issueInboundServiceToken();
        const password = 'a'.repeat(length);

        await postRegistration(app(), validBody({ password }), {
          token,
          idempotencyKey: randomUUID(),
        });

        expect(execute).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({ password }) as unknown,
          }),
        );
      },
    );
  });

  describe('input normalization', () => {
    it('trims outer spaces of name and email before calling the use case', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue({
        id: randomUUID(),
        name: 'Jane Guest',
        email: 'jane.guest@example.test',
        role: 'GUEST',
      });
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postRegistration(
        app(),
        validBody({ name: '  Jane Guest  ', email: '  jane.guest@example.test  ' }),
        { token, idempotencyKey: randomUUID() },
      );

      expect(response.status).toBe(201);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            name: 'Jane Guest',
            email: 'jane.guest@example.test',
          }) as unknown,
        }),
      );
    });

    it('rejects a name that is empty after trimming', async (): Promise<void> => {
      await open();
      execute.mockResolvedValue({
        id: randomUUID(),
        name: '',
        email: 'jane.guest@example.test',
        role: 'GUEST',
      });
      const token = await app().fixture.issueInboundServiceToken();

      const response = await postRegistration(app(), validBody({ name: '   ' }), {
        token,
        idempotencyKey: randomUUID(),
      });

      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('400 validation', () => {
    const cases = [
      { name: 'missing idempotency key', body: validBody(), key: null },
      { name: 'non UUID idempotency key', body: validBody(), key: 'not-a-uuid' },
      { name: 'empty name', body: { ...validBody(), name: '' } },
      { name: 'one character name', body: { ...validBody(), name: 'a' } },
      { name: 'name longer than 100', body: { ...validBody(), name: 'a'.repeat(101) } },
      { name: 'malformed email', body: { ...validBody(), email: 'not-an-email' } },
      {
        name: 'email longer than 254',
        body: { ...validBody(), email: `${'a'.repeat(250)}@example.test` },
      },
      { name: 'password with 7 code points', body: { ...validBody(), password: 'a'.repeat(7) } },
      {
        name: 'password with 129 code points',
        body: { ...validBody(), password: 'a'.repeat(129) },
      },
      { name: 'ADMIN role', body: { ...validBody(), role: 'ADMIN' } },
      { name: 'unknown field', body: { ...validBody(), admin: true } },
      { name: 'null email', body: { ...validBody(), email: null } },
    ];

    it.each(cases)('rejects $name with a problem+json 400', async ({ body, key }): Promise<void> => {
      await open();
      const token = await app().fixture.issueInboundServiceToken();
      const idempotencyKey = key === undefined ? randomUUID() : key;

      const response = await postRegistration(app(), body, { token, idempotencyKey });

      expectProblem(response, 'VALIDATION_FAILED', 400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('401 service authentication', () => {
    it('rejects a request without a bearer token', async (): Promise<void> => {
      await open();

      const response = await postRegistration(app(), validBody(), {
        idempotencyKey: randomUUID(),
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

      const response = await postRegistration(app(), validBody(), {
        token,
        idempotencyKey: randomUUID(),
      });

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

      const response = await postRegistration(app(), validBody(), {
        token,
        idempotencyKey: randomUUID(),
      });

      expectProblem(response, 'HTTP_401', 401);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('application errors', () => {
    const failures = [
      {
        label: 'idempotency conflict',
        error: new IdempotencyConflictError(),
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      },
      {
        label: 'registration conflict',
        error: new RegistrationConflictError(),
        status: 409,
        code: 'REGISTRATION_CONFLICT',
      },
      {
        label: 'cancelled registration',
        error: new RegistrationCancelledError(),
        status: 409,
        code: 'REGISTRATION_CANCELLED',
      },
      {
        label: 'dependency unavailable',
        error: new DependencyUnavailableError('users'),
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
      },
    ];

    it.each(failures)(
      'maps $label to a problem+json $status',
      async ({ error, status, code }): Promise<void> => {
        await open();
        execute.mockRejectedValue(error);
        const token = await app().fixture.issueInboundServiceToken();
        const traceId = 'trace-error-12345678';

        const response = await postRegistration(app(), validBody(), {
          token,
          idempotencyKey: randomUUID(),
          traceId,
        });

        expectProblem(response, code, status);
        const body = response.body as ProblemBody;
        expect(body.traceId).toBe(traceId);
        expect(response.headers['x-trace-id']).toBe(traceId);
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain(PASSWORD);
        expect(serialized).not.toContain('@example.test');
      },
    );
  });
});
