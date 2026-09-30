import { randomUUID } from 'node:crypto';

import type { AuthCache, LoginFailureWindow } from '@auth/application/ports/cache.port';
import type { SessionUnitOfWork, SessionUnitOfWorkContext } from '@auth/application/ports/session-unit-of-work.port';
import { RefreshTokenInvalidError } from '@auth/application/errors/auth-errors';
import { IssueSessionTokensService } from '@auth/application/sessions/issue-session-tokens.service';
import { RotateRefreshTokenService } from '@auth/application/sessions/rotate-refresh-token.use-case';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { PrismaRefreshTokenRepository } from '@auth/infrastructure/persistence/prisma/refresh-token.repository';
import { PrismaSessionUnitOfWork } from '@auth/infrastructure/persistence/prisma/session-unit-of-work';
import { HmacRefreshTokenCodec } from '@auth/infrastructure/security/hmac-refresh-token.codec';
import type { RefreshToken } from '@auth/domain/tokens/refresh-token';
import { createAuthCryptoFixture } from '../helpers/crypto-fixture';
import { FakeClock } from '../helpers/fake-clock';
import { StubAccessTokenSigner } from '../helpers/reference-refresh-rotation';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const ABSOLUTE_EXPIRY = new Date('2026-10-05T12:00:00.000Z');

interface SeededSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly rawToken: string;
}

class SpyAuthCache implements AuthCache {
  public readonly deleted: string[] = [];
  public failDelete = false;

  public readLoginFailures(): Promise<LoginFailureWindow> {
    return Promise.reject(new Error('not implemented'));
  }

  public recordLoginFailure(): Promise<LoginFailureWindow> {
    return Promise.reject(new Error('not implemented'));
  }

  public clearLoginFailures(): Promise<void> {
    return Promise.resolve();
  }

  public getSession<T>(): Promise<T | null> {
    return Promise.resolve(null);
  }

  public setSession(): Promise<void> {
    return Promise.resolve();
  }

  public deleteSession(sessionId: string): Promise<void> {
    if (this.failDelete) return Promise.reject(new Error('redis-down'));
    this.deleted.push(sessionId);
    return Promise.resolve();
  }

  public ping(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class FailingAfterInsertUnitOfWork implements SessionUnitOfWork {
  public constructor(private readonly inner: SessionUnitOfWork) {}

  public execute<T>(work: (context: SessionUnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.inner.execute((context) =>
      work({
        ...context,
        insertSuccessor: async (token: RefreshToken): Promise<void> => {
          await context.insertSuccessor(token);
          throw new Error('injected-insert-failure');
        },
      }),
    );
  }
}

describe('refresh rotation over PostgreSQL (AUTH-055 re-run against the productive rotation)', () => {
  let dependencies: IntegrationDependencies;
  let primary: PrismaService;
  let secondary: PrismaService;
  let codec: HmacRefreshTokenCodec;
  let signer: StubAccessTokenSigner;
  let clock: FakeClock;
  let cache: SpyAuthCache;
  let service: RotateRefreshTokenService;
  let otherService: RotateRefreshTokenService;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    const databaseUrl = process.env.TEST_AUTH_DATABASE_URL as string;
    primary = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    secondary = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    await Promise.all([primary.$connect(), secondary.$connect()]);
    codec = new HmacRefreshTokenCodec(createAuthCryptoFixture().config);
  });

  afterAll(async () => {
    await Promise.all([primary.$disconnect(), secondary.$disconnect()]);
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
    clock = new FakeClock(NOW);
    signer = new StubAccessTokenSigner();
    cache = new SpyAuthCache();
    service = buildService(primary);
    otherService = buildService(secondary);
  });

  function buildService(prisma: PrismaService, unitOfWork?: SessionUnitOfWork): RotateRefreshTokenService {
    const issuer = new IssueSessionTokensService({
      codec,
      signer,
      uuid: { generate: randomUUID },
      clock,
    });
    return new RotateRefreshTokenService({
      refreshTokens: new PrismaRefreshTokenRepository(prisma),
      unitOfWork: unitOfWork ?? new PrismaSessionUnitOfWork(prisma),
      codec,
      issuer,
      clock,
      cache,
    });
  }

  async function seedActiveSession(
    options: {
      readonly userId?: string;
      readonly rawToken?: string;
      readonly issuedAt?: Date;
      readonly expiresAt?: Date;
    } = {},
  ): Promise<SeededSession> {
    const userId = options.userId ?? randomUUID();
    const sessionId = randomUUID();
    const rawToken = options.rawToken ?? codec.generateRawToken();
    const issuedAt = options.issuedAt ?? NOW;
    const expiresAt = options.expiresAt ?? ABSOLUTE_EXPIRY;
    await primary.session.create({
      data: {
        id: sessionId,
        userId,
        role: 'OWNER',
        absoluteExpiresAt: ABSOLUTE_EXPIRY,
        revokedAt: null,
        revokeReason: null,
        createdAt: NOW,
        version: 1,
      },
    });
    await primary.refreshToken.create({
      data: {
        id: randomUUID(),
        sessionId,
        tokenHash: codec.hash(rawToken),
        status: 'ACTIVE',
        issuedAt,
        expiresAt,
        consumedAt: null,
        replacedByTokenId: null,
      },
    });
    return { sessionId, userId, rawToken };
  }

  async function rotate(rawToken: string): Promise<string> {
    const pair = await service.execute({ refreshToken: rawToken, traceId: 'trace-rotation' });
    return pair.refreshToken;
  }

  it('consumes the old token, links a single successor and keeps the absolute expiry', async (): Promise<void> => {
    const seeded = await seedActiveSession();

    const pair = await service.execute({ refreshToken: seeded.rawToken, traceId: 'trace-success' });

    expect(pair.accessToken).toContain('access-token.');
    expect(pair.expiresIn).toBe(3600);
    expect(pair.absoluteExpiresAt.toISOString()).toBe(ABSOLUTE_EXPIRY.toISOString());
    expect(pair.principal).toEqual({ userId: seeded.userId, sessionId: seeded.sessionId, role: 'OWNER' });

    const tokens = await primary.refreshToken.findMany({ where: { sessionId: seeded.sessionId } });
    expect(tokens).toHaveLength(2);
    const active = tokens.filter((token) => token.status === 'ACTIVE');
    expect(active).toHaveLength(1);
    const successor = active[0];
    expect(successor?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(successor?.tokenHash).not.toBe(pair.refreshToken);
    expect(successor?.tokenHash).toBe(codec.hash(pair.refreshToken));
    expect(successor?.expiresAt.toISOString()).toBe(ABSOLUTE_EXPIRY.toISOString());

    const consumed = tokens.find((token) => token.tokenHash === codec.hash(seeded.rawToken));
    expect(consumed).toMatchObject({ status: 'CONSUMED' });
    expect(consumed?.consumedAt).not.toBeNull();
    expect(consumed?.replacedByTokenId).toBe(successor?.id);

    const session = await primary.session.findUnique({ where: { id: seeded.sessionId } });
    expect(session?.version).toBe(2);
    expect(session?.absoluteExpiresAt.toISOString()).toBe(ABSOLUTE_EXPIRY.toISOString());
    expect(session?.role).toBe('OWNER');
    expect(cache.deleted).toHaveLength(0);
  });

  it('rejects an unknown token without touching persisted state', async (): Promise<void> => {
    await expect(
      service.execute({ refreshToken: 'unknown-token-0123456789-abcdefghijklmnop', traceId: 't' }),
    ).rejects.toBeInstanceOf(RefreshTokenInvalidError);

    expect(await primary.refreshToken.count()).toBe(0);
    expect(await primary.session.count()).toBe(0);
  });

  it('rejects a revoked token without creating a successor', async (): Promise<void> => {
    const seeded = await seedActiveSession();
    await primary.refreshToken.updateMany({
      where: { sessionId: seeded.sessionId },
      data: { status: 'REVOKED' },
    });

    await expect(service.execute({ refreshToken: seeded.rawToken, traceId: 't' })).rejects.toBeInstanceOf(
      RefreshTokenInvalidError,
    );

    const tokens = await primary.refreshToken.findMany({ where: { sessionId: seeded.sessionId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ status: 'REVOKED' });
  });

  it('rejects an expired token within an active session', async (): Promise<void> => {
    const seeded = await seedActiveSession({
      issuedAt: new Date(NOW.getTime() - 7_200_000),
      expiresAt: new Date(NOW.getTime() - 3_600_000),
    });

    await expect(service.execute({ refreshToken: seeded.rawToken, traceId: 't' })).rejects.toBeInstanceOf(
      RefreshTokenInvalidError,
    );
    expect(await primary.refreshToken.count({ where: { sessionId: seeded.sessionId } })).toBe(1);
  });

  it('rejects a token whose session was revoked', async (): Promise<void> => {
    const seeded = await seedActiveSession();
    await primary.session.update({
      where: { id: seeded.sessionId },
      data: { revokedAt: NOW, revokeReason: 'SECURITY', version: 2 },
    });

    await expect(service.execute({ refreshToken: seeded.rawToken, traceId: 't' })).rejects.toBeInstanceOf(
      RefreshTokenInvalidError,
    );
    expect(await primary.refreshToken.count({ where: { sessionId: seeded.sessionId } })).toBe(1);
  });

  it('detects replay after several rotations, revokes the family and invalidates the cache', async (): Promise<void> => {
    const seeded = await seedActiveSession();
    const second = await seedActiveSession({ userId: seeded.userId });

    const rotatedOnce = await rotate(seeded.rawToken);
    await rotate(rotatedOnce);

    await expect(service.execute({ refreshToken: seeded.rawToken, traceId: 't' })).rejects.toBeInstanceOf(
      RefreshTokenInvalidError,
    );

    const session = await primary.session.findUnique({ where: { id: seeded.sessionId } });
    expect(session?.revokeReason).toBe('REFRESH_REUSE');
    expect(session?.revokedAt).not.toBeNull();
    expect(
      await primary.refreshToken.count({ where: { sessionId: seeded.sessionId, status: 'ACTIVE' } }),
    ).toBe(0);
    expect(cache.deleted).toContain(seeded.sessionId);

    const otherSession = await primary.session.findUnique({ where: { id: second.sessionId } });
    expect(otherSession?.revokedAt).toBeNull();
    expect(
      await primary.refreshToken.count({ where: { sessionId: second.sessionId, status: 'ACTIVE' } }),
    ).toBe(1);
  });

  it('commits the replay revocation even though the caller receives a 401', async (): Promise<void> => {
    const seeded = await seedActiveSession();
    await rotate(seeded.rawToken);

    await expect(service.execute({ refreshToken: seeded.rawToken, traceId: 't' })).rejects.toBeInstanceOf(
      RefreshTokenInvalidError,
    );

    const session = await primary.session.findUnique({ where: { id: seeded.sessionId } });
    expect(session?.revokeReason).toBe('REFRESH_REUSE');
    expect(
      await primary.refreshToken.count({ where: { sessionId: seeded.sessionId, status: 'ACTIVE' } }),
    ).toBe(0);
  });

  it('still revokes PostgreSQL when the cache invalidation fails', async (): Promise<void> => {
    const seeded = await seedActiveSession();
    await rotate(seeded.rawToken);
    cache.failDelete = true;

    await expect(service.execute({ refreshToken: seeded.rawToken, traceId: 't' })).rejects.toBeInstanceOf(
      RefreshTokenInvalidError,
    );

    const session = await primary.session.findUnique({ where: { id: seeded.sessionId } });
    expect(session?.revokeReason).toBe('REFRESH_REUSE');
  });

  it('rolls back when signing the access token fails', async (): Promise<void> => {
    const seeded = await seedActiveSession();
    signer.failNext = true;

    await expect(service.execute({ refreshToken: seeded.rawToken, traceId: 't' })).rejects.toThrow(
      'sign-failure',
    );

    const tokens = await primary.refreshToken.findMany({ where: { sessionId: seeded.sessionId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ status: 'ACTIVE' });
    const session = await primary.session.findUnique({ where: { id: seeded.sessionId } });
    expect(session?.version).toBe(1);
    expect(session?.revokedAt).toBeNull();
  });

  it('rolls back when the transaction fails after inserting the successor', async (): Promise<void> => {
    const seeded = await seedActiveSession();
    const failingService = buildService(
      primary,
      new FailingAfterInsertUnitOfWork(new PrismaSessionUnitOfWork(primary)),
    );

    await expect(
      failingService.execute({ refreshToken: seeded.rawToken, traceId: 't' }),
    ).rejects.toThrow('injected-insert-failure');

    const tokens = await primary.refreshToken.findMany({ where: { sessionId: seeded.sessionId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ status: 'ACTIVE' });
    const session = await primary.session.findUnique({ where: { id: seeded.sessionId } });
    expect(session?.version).toBe(1);
  });

  it('serializes two concurrent rotations of the same token across connections', async (): Promise<void> => {
    const seeded = await seedActiveSession();

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = gate.then(() => service.execute({ refreshToken: seeded.rawToken, traceId: 't1' }));
    const second = gate.then(() =>
      otherService.execute({ refreshToken: seeded.rawToken, traceId: 't2' }),
    );
    release();

    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(RefreshTokenInvalidError);

    const session = await primary.session.findUnique({ where: { id: seeded.sessionId } });
    expect(session?.revokeReason).toBe('REFRESH_REUSE');
    expect(
      await primary.refreshToken.count({ where: { sessionId: seeded.sessionId, status: 'ACTIVE' } }),
    ).toBe(0);
    expect(await primary.refreshToken.count({ where: { sessionId: seeded.sessionId } })).toBe(2);
  });
});
