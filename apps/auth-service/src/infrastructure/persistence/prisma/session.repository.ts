import { Injectable } from '@nestjs/common';
import { Prisma, type Session as PrismaSession } from '@prisma/client';

import type { SessionRepository } from '@auth/application/ports/repositories.port';
import { Session, type SessionRevokeReason } from '@auth/domain/sessions/session';
import { PrismaService } from './prisma.service';

type RawExecutor = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type SessionClient = (Pick<PrismaService, 'session'> | Prisma.TransactionClient) & RawExecutor;

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row === null ? null : toSessionDomain(row);
  }

  public async save(session: Session): Promise<void> {
    await persistSession(this.prisma, session);
  }

  public withLocked<T>(id: string, work: (session: Session | null) => Promise<T>): Promise<T> {
    return this.prisma.transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const row = await transaction.session.findUnique({ where: { id } });
        const session = row === null ? null : toSessionDomain(row);
        const initialVersion = row?.version;
        const result = await work(session);
        if (session !== null && initialVersion !== undefined) {
          const snapshot = session.snapshot();
          const updated = await transaction.session.updateMany({
            where: { id, version: initialVersion },
            data: {
              revokedAt: snapshot.revokedAt,
              revokeReason: snapshot.revokeReason,
              version: snapshot.version,
            },
          });
          if (updated.count !== 1) throw new Error('Session concurrency conflict');
        }
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async revoke(
    id: string,
    revokedAt: Date,
    expectedVersion: number,
    reason: SessionRevokeReason,
  ): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id, version: expectedVersion, revokedAt: null },
      data: { revokedAt, revokeReason: reason, version: { increment: 1 } },
    });
    return result.count === 1;
  }
}

export function createSessionRepository(client: SessionClient): SessionRepository {
  return {
    findById: async (id: string): Promise<Session | null> => {
      const row = await client.session.findUnique({ where: { id } });
      return row === null ? null : toSessionDomain(row);
    },
    save: (session: Session): Promise<void> => persistSession(client, session),
    withLocked: <T>(
      id: string,
      work: (session: Session | null) => Promise<T>,
    ): Promise<T> => withLockedOnClient(client, id, work),
    revoke: async (
      id: string,
      revokedAt: Date,
      expectedVersion: number,
      reason: SessionRevokeReason,
    ): Promise<boolean> => {
      const result = await client.session.updateMany({
        where: { id, version: expectedVersion, revokedAt: null },
        data: { revokedAt, revokeReason: reason, version: { increment: 1 } },
      });
      return result.count === 1;
    },
  };
}

async function withLockedOnClient<T>(
  client: SessionClient,
  id: string,
  work: (session: Session | null) => Promise<T>,
): Promise<T> {
  await client.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${id}::uuid FOR UPDATE`;
  const row = await client.session.findUnique({ where: { id } });
  const session = row === null ? null : toSessionDomain(row);
  const result = await work(session);
  if (session !== null) await persistSession(client, session);
  return result;
}

export async function persistSession(client: SessionClient, session: Session): Promise<void> {
  const data = session.snapshot();
  await client.session.upsert({
    where: { id: data.id },
    create: data,
    update: {
      revokedAt: data.revokedAt,
      revokeReason: data.revokeReason,
      version: data.version,
    },
  });
}

export function toSessionDomain(row: PrismaSession): Session {
  return Session.rehydrate({
    id: row.id,
    userId: row.userId,
    role: row.role,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason,
    createdAt: row.createdAt,
    version: row.version,
  });
}
