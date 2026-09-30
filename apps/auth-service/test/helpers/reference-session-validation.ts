import type { AuthCache, LoginFailureWindow } from '@auth/application/ports/cache.port';
import type { SessionRepository } from '@auth/application/ports/repositories.port';
import type { Session } from '@auth/domain/sessions/session';

export class ThrowingSessionRepository implements SessionRepository {
  public findById(): Promise<Session | null> {
    return Promise.reject(new Error('database unavailable'));
  }

  public save(): Promise<void> {
    return Promise.reject(new Error('database unavailable'));
  }

  public withLocked<T>(): Promise<T> {
    return Promise.reject(new Error('database unavailable'));
  }

  public revoke(): Promise<boolean> {
    return Promise.reject(new Error('database unavailable'));
  }
}

export class UnavailableAuthCache implements AuthCache {
  public readLoginFailures(): Promise<LoginFailureWindow> {
    return Promise.reject(new Error('redis unavailable'));
  }

  public recordLoginFailure(): Promise<LoginFailureWindow> {
    return Promise.reject(new Error('redis unavailable'));
  }

  public clearLoginFailures(): Promise<void> {
    return Promise.reject(new Error('redis unavailable'));
  }

  public getSession<T>(): Promise<T | null> {
    return Promise.reject(new Error('redis unavailable'));
  }

  public setSession(): Promise<void> {
    return Promise.reject(new Error('redis unavailable'));
  }

  public deleteSession(): Promise<void> {
    return Promise.reject(new Error('redis unavailable'));
  }

  public ping(): Promise<boolean> {
    return Promise.reject(new Error('redis unavailable'));
  }
}
