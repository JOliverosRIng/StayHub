import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type RefreshToken as PrismaRefreshToken,
  type Session as PrismaSession,
} from '@prisma/client';

import type {
  SessionUnitOfWork,
  SessionUnitOfWorkContext,
} from '@auth/application/ports/session-unit-of-work.port';
import type { Session } from '@auth/domain/sessions/session';
import type { RefreshToken } from '@auth/domain/tokens/refresh-token';
import { PrismaService } from './prisma.service';
import {
  createRefreshTokenRepository,
  toRefreshTokenDomain,
} from './refresh-token.repository';
import { createSessionRepository, persistSession, toSessionDomain } from './session.repository';

const MAX_TRANSACTION_ATTEMPTS = 3;
const CONCURRENCY_CODES = new Set(['P2034', '40001', '40P01']);

@Injectable()
export class PrismaSessionUnitOfWork implements SessionUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async execute<T>(work: (context: SessionUnitOfWorkContext) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.transaction((transaction) => work(createContext(transaction)));
      } catch (error) {
        if (attempt >= MAX_TRANSACTION_ATTEMPTS || !isConcurrencyError(error)) throw error;
      }
    }
  }
}

function createContext(transaction: Prisma.TransactionClient): SessionUnitOfWorkContext {
  return {
    sessions: createSessionRepository(transaction),
    refreshTokens: createRefreshTokenRepository(transaction),
    findSessionById: async (id: string): Promise<Session | null> => {
      const row = await transaction.session.findUnique({ where: { id } });
      return row === null ? null : toSessionDomain(row);
    },
    findRefreshByHash: async (tokenHash: string): Promise<RefreshToken | null> => {
      const row = await transaction.refreshToken.findUnique({ where: { tokenHash } });
      return row === null ? null : toRefreshTokenDomain(row);
    },
    lockSession: async (id: string): Promise<Session | null> => {
      const rows = await transaction.$queryRaw<PrismaSession[]>`
        SELECT * FROM "Session" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      const row = rows[0];
      return row === undefined ? null : toSessionDomain(row);
    },
    lockRefresh: async (tokenHash: string): Promise<RefreshToken | null> => {
      const rows = await transaction.$queryRaw<PrismaRefreshToken[]>`
        SELECT * FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
      `;
      const row = rows[0];
      return row === undefined ? null : toRefreshTokenDomain(row);
    },
    saveSession: (session: Session): Promise<void> => persistSession(transaction, session),
    insertSuccessor: async (token: RefreshToken): Promise<void> => {
      await transaction.refreshToken.create({ data: token.snapshot() });
    },
    markConsumed: async (tokenId: string, now: Date): Promise<void> => {
      await transaction.refreshToken.update({
        where: { id: tokenId },
        data: { status: 'CONSUMED', consumedAt: now },
      });
    },
    linkSuccessor: async (previousTokenId: string, successorTokenId: string): Promise<void> => {
      await transaction.refreshToken.update({
        where: { id: previousTokenId },
        data: { replacedByTokenId: successorTokenId },
      });
    },
    revokeActiveForSession: async (sessionId: string): Promise<number> => {
      const result = await transaction.refreshToken.updateMany({
        where: { sessionId, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
      return result.count;
    },
  };
}

export function isConcurrencyError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (CONCURRENCY_CODES.has(error.code)) return true;
    const meta = error.meta as { code?: unknown } | undefined;
    if (typeof meta?.code === 'string' && CONCURRENCY_CODES.has(meta.code)) return true;
    return false;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && CONCURRENCY_CODES.has(code)) return true;
  }
  return false;
}
