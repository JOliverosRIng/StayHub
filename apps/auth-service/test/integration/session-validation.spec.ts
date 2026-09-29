import { randomUUID } from 'node:crypto';

import type { AuthCache } from '@auth/application/ports/cache.port';
import type { SessionRepository } from '@auth/application/ports/repositories.port';
import { DependencyUnavailableError, SessionInvalidError } from '@auth/application/errors/auth-errors';
import { ValidateSessionService } from '@auth/application/sessions/validate-session.use-case';
import { AuthCacheAdapter } from '@auth/infrastructure/cache/auth-cache.adapter';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { PrismaSessionRepository } from '@auth/infrastructure/persistence/prisma/session.repository';
import { createAuthCryptoFixture } from '../helpers/crypto-fixture';
import { FakeClock } from '../helpers/fake-clock';
import {
  ThrowingSessionRepository,
  UnavailableAuthCache,
} from '../helpers/reference-session-validation';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const ABSOLUTE_EXPIRY = new Date('2026-10-05T12:00:00.000Z');

interface SeededSession {
  readonly sessionId: string;
  readonly userId: string;
}

interface ValidationHarness {
  readonly service: ValidateSessionService;
}

describe('session validation and cache (AUTH-057)', () => {
  let dependencies: IntegrationDependencies;
  let primary: PrismaService;
  let cache: AuthCacheAdapter;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    primary = new PrismaService({
      datasources: { db: { url: process.env.TEST_AUTH_DATABASE_URL as string } },
    });
    await primary.$connect();
    cache = new AuthCacheAdapter(
      createAuthCryptoFixture({ redisUrl: process.env.TEST_AUTH_REDIS_URL as string }).config,
    );
  });

  afterAll(async () => {
    await cache.onModuleDestroy();
    await primary.$disconnect();
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
  });

  function cacheKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  function buildService(
    overrides: { readonly sessions?: SessionRepository; readonly cache?: AuthCache } = {},
  ): ValidationHarness {
    const service = new ValidateSessionService({
      sessions: overrides.sessions ?? new PrismaSessionRepository(primary),
      cache: overrides.cache ?? cache,
      clock: new FakeClock(NOW),
    });
    return { service };
  }

  async function seedSession(
    options: {
      readonly role?: 'GUEST' | 'OWNER' | 'ADMIN';
      readonly revoked?: boolean;
      readonly revokeReason?: 'REFRESH_REUSE' | 'SECURITY';
      readonly expired?: boolean;
    } = {},
  ): Promise<SeededSession> {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const expired = options.expired === true;
    await primary.session.create({
      data: {
        id: sessionId,
        userId,
        role: options.role ?? 'GUEST',
        absoluteExpiresAt: expired ? new Date(NOW.getTime() - 86_400_000) : ABSOLUTE_EXPIRY,
        revokedAt: options.revoked === true ? NOW : null,
        revokeReason: options.revoked === true ? (options.revokeReason ?? 'SECURITY') : null,
        createdAt: expired ? new Date(NOW.getTime() - 8 * 86_400_000) : NOW,
        version: 1,
      },
    });
    return { sessionId, userId };
  }

  it.each(['GUEST', 'OWNER', 'ADMIN'] as const)(
    'validates an active session with the authoritative %s role',
    async (role): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession({ role });

      const result = await harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        traceId: 'trace-active',
      });

      expect(result).toEqual({ active: true, role });
    },
  );

  describe('invalid sessions return a generic error', () => {
    it('rejects an unknown session', async (): Promise<void> => {
      const harness = buildService();

      await expect(
        harness.service.execute({ sessionId: randomUUID(), userId: randomUUID(), traceId: 'trace' }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('rejects a userId mismatch', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession({ role: 'OWNER' });

      await expect(
        harness.service.execute({
          sessionId: seeded.sessionId,
          userId: randomUUID(),
          traceId: 'trace-mismatch',
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('rejects a revoked session', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession({ revoked: true, revokeReason: 'SECURITY' });

      await expect(
        harness.service.execute({
          sessionId: seeded.sessionId,
          userId: seeded.userId,
          traceId: 'trace-revoked',
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('rejects an expired session', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession({ expired: true });

      await expect(
        harness.service.execute({
          sessionId: seeded.sessionId,
          userId: seeded.userId,
          traceId: 'trace-expired',
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('rejects a session revoked by replay immediately', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession({ role: 'OWNER' });
      await primary.session.update({
        where: { id: seeded.sessionId },
        data: { revokedAt: NOW, revokeReason: 'REFRESH_REUSE', version: 2 },
      });

      await expect(
        harness.service.execute({
          sessionId: seeded.sessionId,
          userId: seeded.userId,
          traceId: 'trace-replay',
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });
  });

  it('does not let a stale ACTIVE cache resurrect a revoked session', async (): Promise<void> => {
    const harness = buildService();
    const seeded = await seedSession({ role: 'OWNER' });
    await dependencies.redis.set(
      cacheKey(seeded.sessionId),
      JSON.stringify({ active: true, role: 'OWNER' }),
      'EX',
      300,
    );
    await primary.session.update({
      where: { id: seeded.sessionId },
      data: { revokedAt: NOW, revokeReason: 'REFRESH_REUSE', version: 2 },
    });

    await expect(
      harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        traceId: 'trace-stale',
      }),
    ).rejects.toBeInstanceOf(SessionInvalidError);

    expect(await dependencies.redis.exists(cacheKey(seeded.sessionId))).toBe(0);
  });

  it('returns 503 on a database failure even with a positive cache hit', async (): Promise<void> => {
    const sessionId = randomUUID();
    await dependencies.redis.set(
      cacheKey(sessionId),
      JSON.stringify({ active: true, role: 'GUEST' }),
      'EX',
      300,
    );
    const harness = buildService({ sessions: new ThrowingSessionRepository() });

    await expect(
      harness.service.execute({ sessionId, userId: randomUUID(), traceId: 'trace-db-down' }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);
  });

  it('validates against the database when Redis is unavailable', async (): Promise<void> => {
    const harness = buildService({ cache: new UnavailableAuthCache() });
    const seeded = await seedSession({ role: 'OWNER' });

    await expect(
      harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        traceId: 'trace-redis-down',
      }),
    ).resolves.toEqual({ active: true, role: 'OWNER' });

    await expect(
      harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        accessTokenExpiresAt: new Date(NOW.getTime() + 60_000),
        traceId: 'trace-redis-down-exp',
      }),
    ).resolves.toEqual({ active: true, role: 'OWNER' });
  });

  it('ignores corrupt cache JSON instead of failing with a 500', async (): Promise<void> => {
    const harness = buildService();
    const seeded = await seedSession({ role: 'GUEST' });
    await dependencies.redis.set(cacheKey(seeded.sessionId), 'not-json{', 'EX', 300);

    await expect(
      harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        traceId: 'trace-corrupt',
      }),
    ).resolves.toEqual({ active: true, role: 'GUEST' });
  });

  describe('positive cache policy', () => {
    it('does not write a positive cache without an access token expiry', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession();

      await harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        traceId: 'trace-no-exp',
      });

      expect(await dependencies.redis.exists(cacheKey(seeded.sessionId))).toBe(0);
    });

    it('writes a positive cache bounded by the access token expiry', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession();

      await harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        accessTokenExpiresAt: new Date(NOW.getTime() + 120_000),
        traceId: 'trace-exp',
      });

      const ttl = await dependencies.redis.pttl(cacheKey(seeded.sessionId));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120_000);
      const stored = await dependencies.redis.get(cacheKey(seeded.sessionId));
      expect(JSON.parse(stored as string)).toEqual({ active: true, role: 'GUEST' });
    });

    it('caps the positive cache TTL at the session absolute expiry', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession();

      await harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        accessTokenExpiresAt: new Date(NOW.getTime() + 10 * 86_400_000),
        traceId: 'trace-session-cap',
      });

      const ttl = await dependencies.redis.pttl(cacheKey(seeded.sessionId));
      expect(ttl).toBeGreaterThan(604_000_000);
      expect(ttl).toBeLessThanOrEqual(604_800_000);
    });

    it('does not write a non-positive TTL', async (): Promise<void> => {
      const harness = buildService();
      const seeded = await seedSession();

      await harness.service.execute({
        sessionId: seeded.sessionId,
        userId: seeded.userId,
        accessTokenExpiresAt: new Date(NOW.getTime() - 1000),
        traceId: 'trace-non-positive',
      });

      expect(await dependencies.redis.exists(cacheKey(seeded.sessionId))).toBe(0);
    });
  });

  it('keeps the authoritative session role without consulting Users', async (): Promise<void> => {
    const harness = buildService();
    const seeded = await seedSession({ role: 'ADMIN' });

    const result = await harness.service.execute({
      sessionId: seeded.sessionId,
      userId: seeded.userId,
      traceId: 'trace-role',
    });

    expect(result).toEqual({ active: true, role: 'ADMIN' });
  });
});
