import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { importPKCS8, SignJWT } from 'jose';
import type { Request } from 'express';
import request from 'supertest';

import {
  VALIDATE_SESSION_USE_CASE,
  type ValidateSessionCommand,
  type ValidatedSession,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { TOKEN_SIGNER } from '@auth/application/ports/token-signer.port';
import type { UserRole } from '@auth/application/ports/users-service.port';
import { DependencyUnavailableError, SessionInvalidError } from '@auth/application/errors/auth-errors';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { Rs256TokenService } from '@auth/infrastructure/security/rs256-token.service';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import type { AuthenticatedPrincipal } from '@auth/interfaces/http/auth/authenticated-principal';
import { AccessTokenStrategy } from '@auth/interfaces/http/auth/jwt.strategy';
import { AccessTokenGuard } from '@auth/interfaces/http/guards/access-token.guard';
import { Roles } from '@auth/interfaces/http/guards/roles.decorator';
import { RolesGuard } from '@auth/interfaces/http/guards/roles.guard';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';
import {
  createAuthCryptoFixture,
  createRsaKeyPair,
  type AuthCryptoFixture,
  type IssueInboundServiceTokenOptions,
} from '../helpers/crypto-fixture';

const systemClock: Clock = { now: (): Date => new Date() };
const SERVICE_PATHS = [
  '/internal/v1/registrations',
  '/internal/v1/login',
  '/internal/v1/sessions/refresh',
  '/internal/v1/sessions/validate',
] as const;

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedPrincipal;
}

interface PrincipalResponse {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly role?: UserRole;
}

@Controller('test/access')
@UseGuards(AccessTokenGuard, RolesGuard)
class AccessFixtureController {
  public calls = 0;

  @Post('admin')
  @HttpCode(200)
  @Roles('ADMIN')
  public admin(@Req() httpRequest: AuthenticatedRequest): PrincipalResponse {
    this.calls += 1;
    return httpRequest.user as AuthenticatedPrincipal;
  }

  @Post('staff')
  @HttpCode(200)
  @Roles('OWNER', 'ADMIN')
  public staff(@Req() httpRequest: AuthenticatedRequest): PrincipalResponse {
    this.calls += 1;
    return httpRequest.user as AuthenticatedPrincipal;
  }

  @Post('open')
  @HttpCode(200)
  public open(@Req() httpRequest: AuthenticatedRequest): PrincipalResponse {
    this.calls += 1;
    return httpRequest.user as AuthenticatedPrincipal;
  }
}

@Controller()
class ServiceFixtureController {
  @Post('internal/v1/registrations')
  @HttpCode(200)
  @UseGuards(ServiceAuthGuard)
  public registrations(): { readonly ok: true } {
    return { ok: true };
  }

  @Post('internal/v1/login')
  @HttpCode(200)
  @UseGuards(ServiceAuthGuard)
  public login(): { readonly ok: true } {
    return { ok: true };
  }

  @Post('internal/v1/sessions/refresh')
  @HttpCode(200)
  @UseGuards(ServiceAuthGuard)
  public refresh(): { readonly ok: true } {
    return { ok: true };
  }

  @Post('internal/v1/sessions/validate')
  @HttpCode(200)
  @UseGuards(ServiceAuthGuard)
  public validate(): { readonly ok: true } {
    return { ok: true };
  }
}

type ValidatorMock = jest.Mock<Promise<ValidatedSession>, [ValidateSessionCommand]>;

describe('authentication and authorization (AUTH-058)', () => {
  let application: AuthTestApp | null = null;
  let validator: { execute: ValidatorMock };
  const sessionStore = new Map<string, { readonly userId: string; readonly role: UserRole }>();

  afterEach(async (): Promise<void> => {
    if (application !== null) {
      await application.close();
      application = null;
    }
    sessionStore.clear();
  });

  async function open(options: { readonly fixture?: AuthCryptoFixture } = {}): Promise<void> {
    validator = {
      execute: jest.fn<Promise<ValidatedSession>, [ValidateSessionCommand]>((command) => {
        const record = sessionStore.get(command.sessionId);
        if (record === undefined || record.userId !== command.userId) {
          return Promise.reject(new SessionInvalidError());
        }
        return Promise.resolve({ active: true, role: record.role });
      }),
    };
    application = await createAuthTestApp({
      ...(options.fixture === undefined ? {} : { fixture: options.fixture }),
      imports: [PassportModule],
      providers: [
        ServiceJwtVerifier,
        Rs256TokenService,
        AccessTokenStrategy,
        AccessTokenGuard,
        RolesGuard,
        { provide: TOKEN_SIGNER, useExisting: Rs256TokenService },
        { provide: CLOCK, useValue: systemClock },
        { provide: VALIDATE_SESSION_USE_CASE, useValue: validator },
      ],
      controllers: [AccessFixtureController, ServiceFixtureController],
    });
  }

  function app(): AuthTestApp {
    if (application === null) {
      throw new Error('The test application is not initialized');
    }
    return application;
  }

  function server(): Server {
    return app().app.getHttpServer() as Server;
  }

  function accessController(): AccessFixtureController {
    return app().app.get(AccessFixtureController);
  }

  function registerSession(sessionId: string, userId: string, role: UserRole): void {
    sessionStore.set(sessionId, { userId, role });
  }

  async function authorizedToken(
    role: UserRole,
  ): Promise<{ readonly token: string; readonly userId: string; readonly sessionId: string }> {
    const userId = randomUUID();
    const sessionId = randomUUID();
    registerSession(sessionId, userId, role);
    const token = await app().fixture.issueAccessToken({
      sub: userId,
      sid: sessionId,
      role,
    });
    return { token, userId, sessionId };
  }

  function postAccess(
    path: string,
    token?: string,
    init: {
      readonly headers?: Readonly<Record<string, string>>;
      readonly body?: unknown;
    } = {},
  ): request.Test {
    let call = request(server()).post(path);
    if (token !== undefined) call = call.set('authorization', `Bearer ${token}`);
    for (const [name, value] of Object.entries(init.headers ?? {})) {
      call = call.set(name, value);
    }
    return call.send((init.body ?? {}) as object);
  }

  async function signWithForeignKey(kid: string, role: UserRole = 'GUEST'): Promise<string> {
    const foreign = createRsaKeyPair('foreign');
    const key = await importPKCS8(foreign.privateKey, 'RS256');
    const issuedAt = Math.floor(Date.now() / 1000);
    return new SignJWT({ sid: randomUUID(), role })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setSubject(randomUUID())
      .setJti(randomUUID())
      .setIssuer(app().fixture.config.accessJwt.issuer)
      .setAudience(app().fixture.config.accessJwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(key);
  }

  function unsignedToken(payload: Readonly<Record<string, unknown>>, kid: string): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', kid, typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.`;
  }

  async function hs256Token(kid: string): Promise<string> {
    const secret = new TextEncoder().encode('shared-secret-shared-secret-shared-secret');
    const issuedAt = Math.floor(Date.now() / 1000);
    return new SignJWT({ sid: randomUUID(), role: 'GUEST' })
      .setProtectedHeader({ alg: 'HS256', kid, typ: 'JWT' })
      .setSubject(randomUUID())
      .setJti(randomUUID())
      .setIssuer(app().fixture.config.accessJwt.issuer)
      .setAudience(app().fixture.config.accessJwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(secret);
  }

  beforeEach(async (): Promise<void> => {
    sessionStore.clear();
    await open();
  });

  describe('access token guard', () => {
    it('rejects a request without a bearer token before running business', async (): Promise<void> => {
      const response = await postAccess('/test/access/admin');

      expect(response.status).toBe(401);
      expect(accessController().calls).toBe(0);
    });

    it('rejects a token signed with a foreign key', async (): Promise<void> => {
      const token = await signWithForeignKey(app().fixture.accessKeys.kid);

      const response = await postAccess('/test/access/open', token);

      expect(response.status).toBe(401);
    });

    it('rejects an unknown kid', async (): Promise<void> => {
      const userId = randomUUID();
      const sessionId = randomUUID();
      registerSession(sessionId, userId, 'GUEST');
      const token = await app().fixture.issueAccessToken({
        sub: userId,
        sid: sessionId,
        role: 'GUEST',
        kid: 'unknown-kid',
      });

      const response = await postAccess('/test/access/open', token);

      expect(response.status).toBe(401);
    });

    it('rejects a wrong issuer and a wrong audience', async (): Promise<void> => {
      const badIssuer = await app().fixture.issueAccessToken({ issuer: 'https://evil.example' });
      const badAudience = await app().fixture.issueAccessToken({ audience: 'other-service' });

      expect((await postAccess('/test/access/open', badIssuer)).status).toBe(401);
      expect((await postAccess('/test/access/open', badAudience)).status).toBe(401);
    });

    it('rejects an expired token', async (): Promise<void> => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const token = await app().fixture.issueAccessToken({
        issuedAt: nowSeconds - 7200,
        expiresInSeconds: 3600,
      });

      const response = await postAccess('/test/access/open', token);

      expect(response.status).toBe(401);
    });

    it('rejects an alg:none token', async (): Promise<void> => {
      const token = unsignedToken(
        { sub: randomUUID(), sid: randomUUID(), role: 'GUEST', jti: randomUUID() },
        app().fixture.accessKeys.kid,
      );

      const response = await postAccess('/test/access/open', token);

      expect(response.status).toBe(401);
    });

    it('rejects an HS256 token', async (): Promise<void> => {
      const token = await hs256Token(app().fixture.accessKeys.kid);

      const response = await postAccess('/test/access/open', token);

      expect(response.status).toBe(401);
    });

    it('rejects a malformed token string', async (): Promise<void> => {
      const response = await postAccess('/test/access/open', 'not-a-token');

      expect(response.status).toBe(401);
    });

    it('rejects a revoked or unknown session', async (): Promise<void> => {
      const userId = randomUUID();
      const sessionId = randomUUID();
      const token = await app().fixture.issueAccessToken({
        sub: userId,
        sid: sessionId,
        role: 'GUEST',
      });

      const response = await postAccess('/test/access/open', token);

      expect(response.status).toBe(401);
    });

    it('rejects a token whose subject does not own the session', async (): Promise<void> => {
      const sessionId = randomUUID();
      registerSession(sessionId, randomUUID(), 'GUEST');
      const token = await app().fixture.issueAccessToken({
        sub: randomUUID(),
        sid: sessionId,
        role: 'GUEST',
      });

      const response = await postAccess('/test/access/open', token);

      expect(response.status).toBe(401);
    });

    it('rejects a role claim that differs from the authoritative session role', async (): Promise<void> => {
      const userId = randomUUID();
      const sessionId = randomUUID();
      registerSession(sessionId, userId, 'GUEST');
      const token = await app().fixture.issueAccessToken({
        sub: userId,
        sid: sessionId,
        role: 'ADMIN',
      });

      const response = await postAccess('/test/access/admin', token);

      expect(response.status).toBe(401);
      expect(accessController().calls).toBe(0);
    });

    it('preserves a 503 when the session dependency fails', async (): Promise<void> => {
      const { token } = await authorizedToken('ADMIN');
      validator.execute.mockRejectedValueOnce(new DependencyUnavailableError('database'));

      const response = await postAccess('/test/access/admin', token);

      expect(response.status).toBe(503);
      expect(accessController().calls).toBe(0);
    });
  });

  describe('roles guard', () => {
    it('returns 403 for a valid identity without the required role', async (): Promise<void> => {
      const { token } = await authorizedToken('GUEST');

      const response = await postAccess('/test/access/admin', token);

      expect(response.status).toBe(403);
      expect(accessController().calls).toBe(0);
    });

    it('allows the required role and exposes the validated principal', async (): Promise<void> => {
      const { token, userId } = await authorizedToken('ADMIN');

      const response = await postAccess('/test/access/admin', token);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ userId, role: 'ADMIN' });
      expect(accessController().calls).toBe(1);
    });

    it('ignores client headers and body fields when building the principal', async (): Promise<void> => {
      const { token, userId } = await authorizedToken('GUEST');

      const response = await postAccess('/test/access/open', token, {
        headers: { 'x-user-id': randomUUID(), 'x-role': 'ADMIN' },
        body: { userId: randomUUID(), role: 'ADMIN' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ userId, role: 'GUEST' });
    });

    it('does not grant a privileged route from client headers', async (): Promise<void> => {
      const { token } = await authorizedToken('GUEST');

      const response = await postAccess('/test/access/admin', token, {
        headers: { 'x-role': 'ADMIN', 'x-user-id': randomUUID() },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('service JWT on the four internal routes', () => {
    it.each(SERVICE_PATHS)('accepts a valid inbound service token on %s', async (path): Promise<void> => {
      const token = await app().fixture.issueInboundServiceToken();

      const response = await request(server())
        .post(path)
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
    });

    it.each(SERVICE_PATHS)('rejects a missing token on %s', async (path): Promise<void> => {
      const response = await request(server()).post(path).send({});

      expect(response.status).toBe(401);
    });

    it.each(SERVICE_PATHS)('rejects a user access token on %s', async (path): Promise<void> => {
      const { token } = await authorizedToken('GUEST');

      const response = await request(server())
        .post(path)
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(401);
    });

    it.each(SERVICE_PATHS)('rejects an outbound Users token on %s', async (path): Promise<void> => {
      const token = await app().fixture.issueOutboundServiceToken();

      const response = await request(server())
        .post(path)
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(401);
    });

    it.each(SERVICE_PATHS)('rejects an insufficient scope on %s', async (path): Promise<void> => {
      const token = await app().fixture.issueInboundServiceToken({ scope: 'users:identity' });

      const response = await request(server())
        .post(path)
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(401);
    });

    const rejected: ReadonlyArray<[string, IssueInboundServiceTokenOptions]> = [
      ['a wrong issuer', { issuer: 'https://evil.example' }],
      ['a wrong audience', { audience: 'other-service' }],
      ['an expired token', { expiresInSeconds: -10 }],
    ];

    it.each(rejected)('rejects %s on an internal route', async (_label, options): Promise<void> => {
      const token = await app().fixture.issueInboundServiceToken(options);

      const response = await request(server())
        .post('/internal/v1/login')
        .set('authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(401);
    });
  });

  it('keeps the traceId on early rejection and never logs the token', async (): Promise<void> => {
    const logger = app().app.get(AuthLogger);
    const spy = jest.spyOn(logger, 'error');
    const marker = 'secret-bearer-MARKER-1234567890';

    const response = await postAccess('/test/access/admin', marker, {
      headers: { 'x-trace-id': 'trace-guard-12345678' },
    });

    expect(response.status).toBe(401);
    expect(response.headers['x-trace-id']).toBe('trace-guard-12345678');
    expect(response.body).toMatchObject({ traceId: 'trace-guard-12345678' });
    expect(JSON.stringify(response.body)).not.toContain(marker);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(marker);
    spy.mockRestore();
  });

  it('accepts a token signed with a previous key in the ring and rejects it once removed', async (): Promise<void> => {
    const base = createAuthCryptoFixture();
    const previous = createRsaKeyPair('previous-access-2025');
    const withPrevious: AuthCryptoFixture = {
      ...base,
      config: {
        ...base.config,
        accessJwt: {
          ...base.config.accessJwt,
          publicKeys: {
            [base.accessKeys.kid]: base.accessKeys.publicKey,
            [previous.kid]: previous.publicKey,
          },
        },
      },
    };

    await app().close();
    application = null;
    await open({ fixture: withPrevious });

    const userId = randomUUID();
    const sessionId = randomUUID();
    registerSession(sessionId, userId, 'OWNER');
    const key = await importPKCS8(previous.privateKey, 'RS256');
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sid: sessionId, role: 'OWNER' })
      .setProtectedHeader({ alg: 'RS256', kid: previous.kid, typ: 'JWT' })
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuer(base.config.accessJwt.issuer)
      .setAudience(base.config.accessJwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(key);

    const accepted = await postAccess('/test/access/open', token);
    expect(accepted.status).toBe(200);

    await app().close();
    application = null;
    const withoutPrevious: AuthCryptoFixture = {
      ...base,
      config: {
        ...base.config,
        accessJwt: {
          ...base.config.accessJwt,
          publicKeys: { [base.accessKeys.kid]: base.accessKeys.publicKey },
        },
      },
    };
    await open({ fixture: withoutPrevious });

    const rejectedAfterRemoval = await postAccess('/test/access/open', token);
    expect(rejectedAfterRemoval.status).toBe(401);
  });
});
