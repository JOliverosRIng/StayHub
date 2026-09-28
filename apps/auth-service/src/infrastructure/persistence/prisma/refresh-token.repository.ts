import { Injectable } from '@nestjs/common';
import { Prisma, type RefreshToken as PrismaRefreshToken } from '@prisma/client';

import type { RefreshTokenRepository } from '@auth/application/ports/repositories.port';
import { RefreshToken } from '@auth/domain/tokens/refresh-token';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row === null ? null : toDomain(row);
  }

  public async save(token: RefreshToken): Promise<void> {
    await persist(this.prisma, token);
  }

  public withLocked<T>(
    tokenHash: string,
    work: (token: RefreshToken | null) => Promise<T>,
  ): Promise<T> {
    return this.prisma.transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
        const row = await transaction.refreshToken.findUnique({ where: { tokenHash } });
        const token = row === null ? null : toDomain(row);
        const result = await work(token);
        if (token !== null) await persist(transaction, token);
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

type RefreshClient = Pick<PrismaService, 'refreshToken'> | Prisma.TransactionClient;

async function persist(client: RefreshClient, token: RefreshToken): Promise<void> {
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

function toDomain(row: PrismaRefreshToken): RefreshToken {
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

