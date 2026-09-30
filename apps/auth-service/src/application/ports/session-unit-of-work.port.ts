import type { Session } from '@auth/domain/sessions/session';
import type { RefreshToken } from '@auth/domain/tokens/refresh-token';
import type { RefreshTokenRepository, SessionRepository } from './repositories.port';

export const SESSION_UNIT_OF_WORK = Symbol('SESSION_UNIT_OF_WORK');

export interface SessionUnitOfWorkContext {
  readonly sessions: SessionRepository;
  readonly refreshTokens: RefreshTokenRepository;
  findSessionById(id: string): Promise<Session | null>;
  findRefreshByHash(tokenHash: string): Promise<RefreshToken | null>;
  lockSession(id: string): Promise<Session | null>;
  lockRefresh(tokenHash: string): Promise<RefreshToken | null>;
  saveSession(session: Session): Promise<void>;
  insertSuccessor(token: RefreshToken): Promise<void>;
  markConsumed(tokenId: string, now: Date): Promise<void>;
  linkSuccessor(previousTokenId: string, successorTokenId: string): Promise<void>;
  revokeActiveForSession(sessionId: string): Promise<number>;
}

export interface SessionUnitOfWork {
  execute<T>(work: (context: SessionUnitOfWorkContext) => Promise<T>): Promise<T>;
}
