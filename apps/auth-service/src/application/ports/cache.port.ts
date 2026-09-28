export const AUTH_CACHE = Symbol('AUTH_CACHE');

export interface AuthCache {
  incrementLoginFailure(identifierHash: string, windowSeconds: number): Promise<number>;
  clearLoginFailures(identifierHash: string): Promise<void>;
  getSession<T>(sessionId: string): Promise<T | null>;
  setSession<T>(sessionId: string, value: T, ttlSeconds: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  ping(): Promise<boolean>;
}

