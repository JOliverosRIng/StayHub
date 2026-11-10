import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { resolve } from 'node:path';

import request from 'supertest';

import {
  DependencyUnavailableError,
  InvalidCredentialsError,
  LoginRateLimitError,
  RefreshTokenInvalidError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import {
  LOGIN_USE_CASE,
  REGISTER_ACCOUNT_USE_CASE,
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
  type IssuedTokenPair,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { LoginController } from '@auth/interfaces/http/login.controller';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { SessionsController } from '@auth/interfaces/http/sessions.controller';

import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';

/**
 * AUTH-078 — Verificación PROVIDER Auth ↔ consumidor Gateway (RQ-02, FR-001–FR-013).
 *
 * El Gateway congela su expectativa en `apps/api-gateway/test/contract/auth.consumer.spec.ts` (GW-056)
 * y materializa el pact `stayhub-api-gateway-stayhub-auth-service.json`. Aquí se ejerce el provider
 * REAL (controladores + service JWT + Problem Details + `x-trace-id`) contra esas interacciones, sin
 * levantar el Gateway: se comprueba que Auth responde los mismos estados, cuerpos y `code` de Problem
 * Details que el consumidor espera. La integración con el Gateway desplegado es AUTH-081.
 */

const PACT_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'api-gateway',
  'test',
  'contract',
  'pacts',
  'stayhub-api-gateway-stayhub-auth-service.json',
);

const SYSTEM_CLOCK: Clock = { now: (): Date => new Date() };
const PASSWORD = 'S3cret-passphrase';
const ABSOLUTE_EXPIRY = new Date('2026-01-01T00:15:00.000Z');
const INTERNAL_PATHS = [
  '/internal/v1/registrations',
  '/internal/v1/login',
  '/internal/v1/sessions/refresh',
  '/internal/v1/sessions/validate',
] as const;
const EXPECTED_STATUSES = [200, 201, 400, 401, 409, 429, 503] as const;

const USER_SUMMARY = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  email: 'ada@stayhub.test',
  role: 'GUEST' as const,
};

const TOKEN_PAIR: IssuedTokenPair = {
  accessToken: 'access.jwt.placeholder',
  refreshToken: 'refresh.opaque.placeholder',
  expiresIn: 3600,
  absoluteExpiresAt: ABSOLUTE_EXPIRY,
  principal: {
    userId: USER_SUMMARY.id,
    sessionId: '22222222-2222-4222-8222-222222222222',
    role: 'GUEST',
  },
};

const REGISTER_BODY = {
  name: USER_SUMMARY.name,
  email: USER_SUMMARY.email,
  password: PASSWORD,
  role: 'GUEST' as const,
};
const LOGIN_BODY = { email: USER_SUMMARY.email, password: PASSWORD };
const REFRESH_BODY = { refreshToken: 'refresh-token-value-0123456789abcdef' };
const VALIDATE_BODY = {
  sessionId: TOKEN_PAIR.principal.sessionId,
  userId: TOKEN_PAIR.principal.userId,
};

interface PactInteraction {
  readonly description: string;
  readonly request: { readonly method: string; readonly path: string };
  readonly response: { readonly status: number };
}

interface Pact {
  readonly consumer: { readonly name: string };
  readonly provider: { readonly name: string };
  readonly interactions: readonly PactInteraction[];
}

interface FieldErrorBody {
  readonly field: string;
  readonly code: string;
  readonly message?: string;
}

interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly traceId: string;
  readonly errors?: readonly FieldErrorBody[];
}

const pact = JSON.parse(readFileSync(PACT_PATH, 'utf8')) as Pact;

function serverOf(target: AuthTestApp): Server {
  return target.app.getHttpServer() as Server;
}

function expectProblem(response: request.Response, code: string, status: number): void {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  const body = response.body as ProblemBody;
  expect(body).toMatchObject({ status, code });
  expect(body.type).toContain(code.toLowerCase().replaceAll('_', '-'));
  expect(typeof body.traceId).toBe('string');
}

describe('Auth provider contra el contrato consumer Gateway (AUTH-078)', () => {
  let application: AuthTestApp | null = null;
  let register: jest.Mock;
  let login: jest.Mock;
  let rotate: jest.Mock;
  let validate: jest.Mock;

  beforeEach(async (): Promise<void> => {
    register = jest.fn();
    login = jest.fn();
    rotate = jest.fn();
    validate = jest.fn();
    application = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: SYSTEM_CLOCK },
        { provide: REGISTER_ACCOUNT_USE_CASE, useValue: { execute: register } },
        { provide: LOGIN_USE_CASE, useValue: { execute: login } },
        { provide: ROTATE_REFRESH_TOKEN_USE_CASE, useValue: { execute: rotate } },
        { provide: VALIDATE_SESSION_USE_CASE, useValue: { execute: validate } },
      ],
      controllers: [RegistrationController, LoginController, SessionsController],
    });
  });

  afterEach(async (): Promise<void> => {
    if (application !== null) {
      await application.close();
      application = null;
    }
  });

  function app(): AuthTestApp {
    if (application === null) {
      throw new Error('The test application is not initialized');
    }
    return application;
  }

  async function token(): Promise<string> {
    return app().fixture.issueInboundServiceToken();
  }

  describe('el pact de GW-056 cubre el provider Auth', () => {
    it('declara las cuatro operaciones internas y los estados contractuales', (): void => {
      expect(pact.consumer.name).toBe('stayhub-api-gateway');
      expect(pact.provider.name).toBe('stayhub-auth-service');
      expect([...new Set(pact.interactions.map((i) => i.request.path))].sort()).toEqual(
        [...INTERNAL_PATHS].sort(),
      );
      expect([...new Set(pact.interactions.map((i) => i.response.status))].sort((a, b) => a - b)).toEqual(
        [...EXPECTED_STATUSES],
      );
    });
  });

  describe('POST /internal/v1/registrations', () => {
    it('201 responde el UserSummary del pacto y propaga el traceId', async (): Promise<void> => {
      register.mockResolvedValue(USER_SUMMARY);
      const traceId = 'trace-provider-reg-01';

      const response = await request(serverOf(app()))
        .post('/internal/v1/registrations')
        .set('authorization', `Bearer ${await token()}`)
        .set('idempotency-key', randomUUID())
        .set('x-trace-id', traceId)
        .send(REGISTER_BODY);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(USER_SUMMARY);
      expect(response.headers['x-trace-id']).toBe(traceId);
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({ traceId }) as unknown,
      );
    });

    it('400 rechaza un cuerpo inválido con VALIDATION_ERROR', async (): Promise<void> => {
      const response = await request(serverOf(app()))
        .post('/internal/v1/registrations')
        .set('authorization', `Bearer ${await token()}`)
        .set('idempotency-key', randomUUID())
        .send({ name: '', email: 'not-an-email', password: 'short', role: 'ADMIN' });

      expectProblem(response, 'VALIDATION_ERROR', 400);
      expect(register).not.toHaveBeenCalled();
    });

    it('400 rechaza un Idempotency-Key que no es UUID', async (): Promise<void> => {
      const response = await request(serverOf(app()))
        .post('/internal/v1/registrations')
        .set('authorization', `Bearer ${await token()}`)
        .set('idempotency-key', 'not-a-uuid')
        .send(REGISTER_BODY);

      expectProblem(response, 'VALIDATION_ERROR', 400);
    });

    it('401 exige un service JWT válido con SERVICE_UNAUTHORIZED', async (): Promise<void> => {
      const response = await request(serverOf(app()))
        .post('/internal/v1/registrations')
        .set('idempotency-key', randomUUID())
        .send(REGISTER_BODY);

      expectProblem(response, 'SERVICE_UNAUTHORIZED', 401);
    });

    it('409 mapea el conflicto de identidad a EMAIL_ALREADY_REGISTERED', async (): Promise<void> => {
      register.mockRejectedValue(new RegistrationConflictError());

      const response = await request(serverOf(app()))
        .post('/internal/v1/registrations')
        .set('authorization', `Bearer ${await token()}`)
        .set('idempotency-key', randomUUID())
        .send(REGISTER_BODY);

      expectProblem(response, 'EMAIL_ALREADY_REGISTERED', 409);
    });

    it('503 falla cerrado cuando Users no está disponible', async (): Promise<void> => {
      register.mockRejectedValue(new DependencyUnavailableError('users-service'));

      const response = await request(serverOf(app()))
        .post('/internal/v1/registrations')
        .set('authorization', `Bearer ${await token()}`)
        .set('idempotency-key', randomUUID())
        .send(REGISTER_BODY);

      expectProblem(response, 'DEPENDENCY_UNAVAILABLE', 503);
    });
  });

  describe('POST /internal/v1/login', () => {
    it('200 responde el InternalTokenPair del pacto', async (): Promise<void> => {
      login.mockResolvedValue(TOKEN_PAIR);

      const response = await request(serverOf(app()))
        .post('/internal/v1/login')
        .set('authorization', `Bearer ${await token()}`)
        .send(LOGIN_BODY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: TOKEN_PAIR.accessToken,
        refreshToken: TOKEN_PAIR.refreshToken,
        expiresIn: 3600,
        absoluteExpiresAt: ABSOLUTE_EXPIRY.toISOString(),
        principal: TOKEN_PAIR.principal,
      });
    });

    it('400 rechaza un cuerpo inválido con VALIDATION_ERROR', async (): Promise<void> => {
      const response = await request(serverOf(app()))
        .post('/internal/v1/login')
        .set('authorization', `Bearer ${await token()}`)
        .send({ email: 'not-an-email', password: '' });

      expectProblem(response, 'VALIDATION_ERROR', 400);
    });

    it('401 responde INVALID_CREDENTIALS sin filtrar la causa', async (): Promise<void> => {
      login.mockRejectedValue(new InvalidCredentialsError());

      const response = await request(serverOf(app()))
        .post('/internal/v1/login')
        .set('authorization', `Bearer ${await token()}`)
        .send(LOGIN_BODY);

      expectProblem(response, 'INVALID_CREDENTIALS', 401);
    });

    it('429 responde RATE_LIMITED con Retry-After', async (): Promise<void> => {
      login.mockRejectedValue(new LoginRateLimitError(42));

      const response = await request(serverOf(app()))
        .post('/internal/v1/login')
        .set('authorization', `Bearer ${await token()}`)
        .send(LOGIN_BODY);

      expectProblem(response, 'RATE_LIMITED', 429);
      expect(response.headers['retry-after']).toBe('42');
    });

    it('503 falla cerrado cuando la dependencia autoritativa cae', async (): Promise<void> => {
      login.mockRejectedValue(new DependencyUnavailableError('users-service'));

      const response = await request(serverOf(app()))
        .post('/internal/v1/login')
        .set('authorization', `Bearer ${await token()}`)
        .send(LOGIN_BODY);

      expectProblem(response, 'DEPENDENCY_UNAVAILABLE', 503);
    });
  });

  describe('POST /internal/v1/sessions/refresh', () => {
    it('200 rota el InternalTokenPair del pacto', async (): Promise<void> => {
      rotate.mockResolvedValue(TOKEN_PAIR);

      const response = await request(serverOf(app()))
        .post('/internal/v1/sessions/refresh')
        .set('authorization', `Bearer ${await token()}`)
        .send(REFRESH_BODY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: TOKEN_PAIR.accessToken,
        refreshToken: TOKEN_PAIR.refreshToken,
        expiresIn: 3600,
        absoluteExpiresAt: ABSOLUTE_EXPIRY.toISOString(),
        principal: TOKEN_PAIR.principal,
      });
    });

    it('401 rechaza un refresh inválido o reusado con REFRESH_REJECTED', async (): Promise<void> => {
      rotate.mockRejectedValue(new RefreshTokenInvalidError());

      const response = await request(serverOf(app()))
        .post('/internal/v1/sessions/refresh')
        .set('authorization', `Bearer ${await token()}`)
        .send(REFRESH_BODY);

      expectProblem(response, 'REFRESH_REJECTED', 401);
    });

    it('503 falla cerrado cuando la persistencia cae', async (): Promise<void> => {
      rotate.mockRejectedValue(new DependencyUnavailableError('database'));

      const response = await request(serverOf(app()))
        .post('/internal/v1/sessions/refresh')
        .set('authorization', `Bearer ${await token()}`)
        .send(REFRESH_BODY);

      expectProblem(response, 'DEPENDENCY_UNAVAILABLE', 503);
    });
  });

  describe('POST /internal/v1/sessions/validate', () => {
    it('200 responde la sesión autoritativa del pacto', async (): Promise<void> => {
      validate.mockResolvedValue({ active: true, role: 'GUEST' });

      const response = await request(serverOf(app()))
        .post('/internal/v1/sessions/validate')
        .set('authorization', `Bearer ${await token()}`)
        .send(VALIDATE_BODY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ active: true, role: 'GUEST' });
    });

    it('401 exige un service JWT válido con SERVICE_UNAUTHORIZED', async (): Promise<void> => {
      const response = await request(serverOf(app()))
        .post('/internal/v1/sessions/validate')
        .send(VALIDATE_BODY);

      expectProblem(response, 'SERVICE_UNAUTHORIZED', 401);
    });

    it('503 falla cerrado cuando la dependencia cae', async (): Promise<void> => {
      validate.mockRejectedValue(new DependencyUnavailableError('database'));

      const response = await request(serverOf(app()))
        .post('/internal/v1/sessions/validate')
        .set('authorization', `Bearer ${await token()}`)
        .send(VALIDATE_BODY);

      expectProblem(response, 'DEPENDENCY_UNAVAILABLE', 503);
    });
  });
});
