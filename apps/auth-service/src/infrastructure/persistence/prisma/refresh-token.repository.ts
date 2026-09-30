import { Injectable } from '@nestjs/common';
import { Prisma, type RefreshToken as PrismaRefreshToken } from '@prisma/client';

import type { RefreshTokenRepository } from '@auth/application/ports/repositories.port';
import { RefreshToken } from '@auth/domain/tokens/refresh-token';
import { PrismaService } from './prisma.service';

type RawExecutor = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type RefreshClient = (Pick<PrismaService, 'refreshToken'> | Prisma.TransactionClient) &
  RawExecutor;

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row === null ? null : toRefreshTokenDomain(row);
  }

  public async save(token: RefreshToken): Promise<void> {
    await persistRefreshToken(this.prisma, token);
  }

  public withLocked<T>(
    tokenHash: string,
    work: (token: RefreshToken | null) => Promise<T>,
  ): Promise<T> {
    return this.prisma.transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
        const row = await transaction.refreshToken.findUnique({ where: { tokenHash } });
        const token = row === null ? null : toRefreshTokenDomain(row);
        const result = await work(token);
        if (token !== null) await persistRefreshToken(transaction, token);
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async revokeActiveForSession(sessionId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { sessionId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    return result.count;
  }
}

export function createRefreshTokenRepository(client: RefreshClient): RefreshTokenRepository {
  return {
    findByHash: async (tokenHash: string): Promise<RefreshToken | null> => {
      const row = await client.refreshToken.findUnique({ where: { tokenHash } });
      return row === null ? null : toRefreshTokenDomain(row);
    },
    save: (token: RefreshToken): Promise<void> => persistRefreshToken(client, token),
    withLocked: async <T>(
      tokenHash: string,
      work: (token: RefreshToken | null) => Promise<T>,
    ): Promise<T> => {
      await client.$queryRaw`SELECT "id" FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
      const row = await client.refreshToken.findUnique({ where: { tokenHash } });
      const token = row === null ? null : toRefreshTokenDomain(row);
      const result = await work(token);
      if (token !== null) await persistRefreshToken(client, token);
      return result;
    },
    revokeActiveForSession: async (sessionId: string): Promise<number> => {
      const result = await client.refreshToken.updateMany({
        where: { sessionId, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
      return result.count;
    },
  };
}

export async function persistRefreshToken(
  client: RefreshClient,
  token: RefreshToken,
): Promise<void> {
  const data = token.snapshot();
  await client.refreshToken.upsert({
    where: { id: data.id },
    create: data,
    update: {
      status: data.status,
      consumedAt: data.consumedAt,
      replacedByTokenId: data.replacedByTokenId,
    },
  });
}

export function toRefreshTokenDomain(row: PrismaRefreshToken): RefreshToken {
  return RefreshToken.rehydrate({
    id: row.id,
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    status: row.status,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    replacedByTokenId: row.replacedByTokenId,
  });
}
