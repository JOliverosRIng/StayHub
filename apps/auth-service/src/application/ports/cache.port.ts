export const AUTH_CACHE = Symbol('AUTH_CACHE');

export interface LoginFailureWindow {
  readonly count: number;
  readonly ttlSeconds: number;
}

export interface AuthCache {
  readLoginFailures(identifierHash: string): Promise<LoginFailureWindow>;
  recordLoginFailure(identifierHash: string, windowSeconds: number): Promise<LoginFailureWindow>;
  clearLoginFailures(identifierHash: string): Promise<void>;
  getSession<T>(sessionId: string): Promise<T | null>;
  setSession<T>(sessionId: string, value: T, ttlSeconds: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  ping(): Promise<boolean>;
}
