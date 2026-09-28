import type { Credential } from '@auth/domain/credentials/credential';
import type { Registration } from '@auth/domain/registrations/registration';
import type { Session } from '@auth/domain/sessions/session';
import type { RefreshToken } from '@auth/domain/tokens/refresh-token';

export const CREDENTIAL_REPOSITORY = Symbol('CREDENTIAL_REPOSITORY');
export const REGISTRATION_REPOSITORY = Symbol('REGISTRATION_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface CredentialRepository {
  findByUserId(userId: string): Promise<Credential | null>;
  save(credential: Credential): Promise<void>;
}

export interface RegistrationRepository {
  findById(id: string): Promise<Registration | null>;
  save(registration: Registration): Promise<void>;
  withLocked<T>(id: string, work: (registration: Registration | null) => Promise<T>): Promise<T>;
}

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  withLocked<T>(id: string, work: (session: Session | null) => Promise<T>): Promise<T>;
  revoke(id: string, revokedAt: Date, expectedVersion: number): Promise<boolean>;
}

export interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  save(token: RefreshToken): Promise<void>;
  withLocked<T>(tokenHash: string, work: (token: RefreshToken | null) => Promise<T>): Promise<T>;
  revokeActiveForSession(sessionId: string): Promise<number>;
}

