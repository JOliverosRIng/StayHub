import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import {
  LOGIN_USE_CASE,
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
} from '@auth/application/ports/auth-use-cases.port';
import { USERS_SERVICE } from '@auth/application/ports/users-service.port';
import { LOGIN_RATE_LIMITER } from '@auth/application/login/login-rate-limiter';
import { ISSUE_SESSION_TOKENS } from '@auth/application/sessions/issue-session-tokens.service';
import { AUTH_CONFIG } from '@auth/infrastructure/config/auth-config';
import { configureAuthHttp } from '@auth/interfaces/http/configure-auth-http';
import { LoginController } from '@auth/interfaces/http/login.controller';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { SessionsController } from '@auth/interfaces/http/sessions.controller';
import { AppModule } from '../../src/app.module';
import { createAuthCryptoFixture, type AuthCryptoFixture } from '../helpers/crypto-fixture';
import { UsersStub } from '../helpers/users-stub';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const PASSWORD = 'Correct-Horse-Battery-Staple-42';
const EMAIL = 'jane.guest@example.test';
const NAME = 'Jane Guest';

describe('auth modules composition (AUTH-072)', () => {
  let dependencies: IntegrationDependencies;
  let stub: UsersStub;
  let fixture: AuthCryptoFixture;
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    stub = new UsersStub({
      requireServiceAuthorization: true,
      verifyServiceToken: (token: string): Promise<boolean> =>
        Promise.resolve(token.split('.').length === 3),
    });
    const usersUrl = await stub.start();
    fixture = createAuthCryptoFixture({
      databaseUrl: process.env.TEST_AUTH_DATABASE_URL as string,
      redisUrl: process.env.TEST_AUTH_REDIS_URL as string,
      usersServiceUrl: usersUrl,
      usersTimeoutMs: 2_000,
      usersCircuitFailureThreshold: 100,
    });

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue(fixture.config)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureAuthHttp(app, { swagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await stub.stop();
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
    stub.reset();
  });

  function server(): Server {
    return app.getHttpServer() as Server;
  }

  async function serviceToken(): Promise<string> {
    return fixture.issueInboundServiceToken();
  }

  async function register(token: string): Promise<void> {
    const response = await request(server())
      .post('/internal/v1/registrations')
      .set('authorization', `Bearer ${token}`)
      .set('idempotency-key', randomUUID())
      .send({ name: NAME, email: EMAIL, password: PASSWORD, role: 'GUEST' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: NAME, email: EMAIL, role: 'GUEST' });
  }

  it('resolves the functional providers without duplicates', () => {
    expect(moduleRef.get(USERS_SERVICE, { strict: false })).toBeDefined();
    expect(moduleRef.get(LOGIN_RATE_LIMITER, { strict: false })).toBeDefined();
    expect(moduleRef.get(LOGIN_USE_CASE, { strict: false })).toBeDefined();
    expect(moduleRef.get(ROTATE_REFRESH_TOKEN_USE_CASE, { strict: false })).toBeDefined();
    expect(moduleRef.get(VALIDATE_SESSION_USE_CASE, { strict: false })).toBeDefined();
    expect(moduleRef.get(ISSUE_SESSION_TOKENS, { strict: false })).toBeDefined();
    expect(moduleRef.get(LoginController, { strict: false })).toBeInstanceOf(LoginController);
    expect(moduleRef.get(SessionsController, { strict: false })).toBeInstanceOf(SessionsController);
    expect(moduleRef.get(RegistrationController, { strict: false })).toBeInstanceOf(
      RegistrationController,
    );
  });

  it('runs register → login → validate → refresh → replay → validate 401', async () => {
    const token = await serviceToken();
    await register(token);

    const login = await request(server())
      .post('/internal/v1/login')
      .set('authorization', `Bearer ${token}`)
      .send({ email: EMAIL, password: PASSWORD });

    expect(login.status).toBe(200);
    const { refreshToken, principal } = login.body as {
      refreshToken: string;
      principal: { userId: string; sessionId: string; role: string };
    };
    expect(principal.role).toBe('GUEST');

    const validated = await request(server())
      .post('/internal/v1/sessions/validate')
      .set('authorization', `Bearer ${token}`)
      .send({ sessionId: principal.sessionId, userId: principal.userId });

    expect(validated.status).toBe(200);
    expect(validated.body).toEqual({ active: true, role: 'GUEST' });

    const rotated = await request(server())
      .post('/internal/v1/sessions/refresh')
      .set('authorization', `Bearer ${token}`)
      .send({ refreshToken });

    expect(rotated.status).toBe(200);
    expect((rotated.body as { refreshToken: string }).refreshToken).not.toBe(refreshToken);

    const replay = await request(server())
      .post('/internal/v1/sessions/refresh')
      .set('authorization', `Bearer ${token}`)
      .send({ refreshToken });

    expect(replay.status).toBe(401);
    expect((replay.body as { code: string }).code).toBe('REFRESH_TOKEN_INVALID');

    const revoked = await request(server())
      .post('/internal/v1/sessions/validate')
      .set('authorization', `Bearer ${token}`)
      .send({ sessionId: principal.sessionId, userId: principal.userId });

    expect(revoked.status).toBe(401);
    expect((revoked.body as { code: string }).code).toBe('SESSION_INVALID');
  });

  it('keeps health endpoints available through the composed modules', async () => {
    const live = await request(server()).get('/health/live');
    expect(live.status).toBe(200);

    const ready = await request(server()).get('/health/ready');
    expect(ready.status).toBe(200);
  });

  it('fails to bootstrap when required configuration is absent', async () => {
    const saved = process.env.AUTH_PORT;
    delete process.env.AUTH_PORT;
    try {
      await expect(
        Test.createTestingModule({ imports: [AppModule] }).compile(),
      ).rejects.toThrow();
    } finally {
      if (saved !== undefined) process.env.AUTH_PORT = saved;
    }
  });
});
