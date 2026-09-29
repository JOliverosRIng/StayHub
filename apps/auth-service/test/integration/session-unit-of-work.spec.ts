import { randomUUID } from 'node:crypto';

import { Session } from '@auth/domain/sessions/session';
import { RefreshToken } from '@auth/domain/tokens/refresh-token';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { PrismaSessionUnitOfWork } from '@auth/infrastructure/persistence/prisma/session-unit-of-work';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const ABSOLUTE_EXPIRY = '2026-10-05T12:00:00.000Z';

describe('PrismaSessionUnitOfWork', () => {
  let dependencies: IntegrationDependencies;
  let primary: PrismaService;
  let secondary: PrismaService;
  let unitOfWork: PrismaSessionUnitOfWork;
  let otherUnitOfWork: PrismaSessionUnitOfWork;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    const databaseUrl = process.env.TEST_AUTH_DATABASE_URL as string;
    primary = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    secondary = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    await Promise.all([primary.$connect(), secondary.$connect()]);
    unitOfWork = new PrismaSessionUnitOfWork(primary);
    otherUnitOfWork = new PrismaSessionUnitOfWork(secondary);
  });

  afterAll(async () => {
    await Promise.all([primary.$disconnect(), secondary.$disconnect()]);
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
  });

  function session(id: string, userId: string): Session {
    return Session.create(id, userId, 'OWNER', NOW);
  }

  function token(id: string, sessionId: string, hash: string): RefreshToken {
    return RefreshToken.create(id, sessionId, hash, NOW, new Date(NOW.getTime() + 604_800_000));
  }

  it('rolls back every implicated table when the callback fails', async () => {
    const id = randomUUID();
    const userId = randomUUID();

    await expect(
      unitOfWork.execute(async (context) => {
        await context.saveSession(session(id, userId));
        await context.insertSuccessor(token(randomUUID(), id, 'a'.repeat(64)));
        throw new Error('technical-failure');
      }),
    ).rejects.toThrow('technical-failure');

    expect(await primary.session.count()).toBe(0);
    expect(await primary.refreshToken.count()).toBe(0);
  });

  it('persists the revoke reason and keeps role and absolute expiry immutable', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await unitOfWork.execute((context) => context.saveSession(session(id, userId)));

    await unitOfWork.execute(async (context) => {
      const locked = await context.lockSession(id);
      expect(locked).not.toBeNull();
      locked?.revoke(NOW, 'REFRESH_REUSE');
      if (locked !== null) await context.saveSession(locked);
    });

    const row = await primary.session.findUnique({ where: { id } });
    expect(row).toMatchObject({ revokeReason: 'REFRESH_REUSE', version: 2, role: 'OWNER' });
    expect(row?.absoluteExpiresAt.toISOString()).toBe(ABSOLUTE_EXPIRY);
  });

  it('rotates with consume, insert successor and link in order', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    const firstId = randomUUID();
    const secondId = randomUUID();
    await unitOfWork.execute(async (context) => {
      await context.saveSession(session(id, userId));
      await context.insertSuccessor(token(firstId, id, 'a'.repeat(64)));
    });

    const located = await primary.refreshToken.findUnique({ where: { tokenHash: 'a'.repeat(64) } });
    expect(located?.sessionId).toBe(id);

    await unitOfWork.execute(async (context) => {
      await context.lockSession(id);
      const current = await context.lockRefresh('a'.repeat(64));
      expect(current).not.toBeNull();
      await context.markConsumed(firstId, NOW);
      await context.insertSuccessor(token(secondId, id, 'b'.repeat(64)));
      await context.linkSuccessor(firstId, secondId);
    });

    const tokens = await primary.refreshToken.findMany({ where: { sessionId: id } });
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((item) => item.status === 'ACTIVE')).toHaveLength(1);
    const consumed = tokens.find((item) => item.id === firstId);
    expect(consumed).toMatchObject({
      status: 'CONSUMED',
      replacedByTokenId: secondId,
    });
    expect(consumed?.consumedAt).not.toBeNull();
  });

  it('keeps at most one active token per session', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await unitOfWork.execute(async (context) => {
      await context.saveSession(session(id, userId));
      await context.insertSuccessor(token(randomUUID(), id, 'a'.repeat(64)));
    });

    await expect(
      unitOfWork.execute((context) => context.insertSuccessor(token(randomUUID(), id, 'c'.repeat(64)))),
    ).rejects.toThrow();

    expect(await primary.refreshToken.count({ where: { sessionId: id, status: 'ACTIVE' } })).toBe(1);
  });

  it('commits a caller result that signals replay instead of throwing inside', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await unitOfWork.execute(async (context) => {
      await context.saveSession(session(id, userId));
      await context.insertSuccessor(token(randomUUID(), id, 'a'.repeat(64)));
    });

    const result = await unitOfWork.execute(async (context) => {
      const locked = await context.lockSession(id);
      if (locked !== null) {
        locked.revoke(NOW, 'REFRESH_REUSE');
        await context.saveSession(locked);
      }
      await context.revokeActiveForSession(id);
      return { kind: 'replay' } as const;
    });

    expect(result.kind).toBe('replay');
    const row = await primary.session.findUnique({ where: { id } });
    expect(row?.revokeReason).toBe('REFRESH_REUSE');
    expect(await primary.refreshToken.count({ where: { sessionId: id, status: 'ACTIVE' } })).toBe(0);
  });

  it('serializes concurrent session locks across connections', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await unitOfWork.execute((context) => context.saveSession(session(id, userId)));

    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = unitOfWork.execute(async (context) => {
      await context.lockSession(id);
      order.push('first-locked');
      await gate;
    });
    await waitFor(() => order.includes('first-locked'));

    const second = otherUnitOfWork.execute(async (context) => {
      await context.lockSession(id);
      order.push('second-locked');
    });
    await sleep(100);
    expect(order).not.toContain('second-locked');

    release();
    await Promise.all([first, second]);
    expect(order).toContain('second-locked');
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error('condition was not met in time');
}

async function sleep(millis: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, millis));
}
