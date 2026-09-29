import { createHmac } from 'node:crypto';

import {
  DependencyUnavailableError,
  LoginRateLimitError,
} from '@auth/application/errors/auth-errors';
import type { AuthCache } from '@auth/application/ports/cache.port';

export const LOGIN_RATE_LIMITER = Symbol('LOGIN_RATE_LIMITER');

export interface LoginRateLimiter {
  inspect(normalizedEmail: string): Promise<void>;
  recordFailure(normalizedEmail: string): Promise<void>;
  clear(normalizedEmail: string): Promise<void>;
}

export interface LoginRateLimiterOptions {
  readonly cache: AuthCache;
  readonly identifierSecret: string;
  readonly windowSeconds?: number;
  readonly limit?: number;
}

/**
 * Application-level login rate limiter implementing D05. It only depends on the `AuthCache` port,
 * hashes the normalized email with a dedicated HMAC-SHA256 secret and never stores the raw email.
 * Redis failures are fail-closed as `DependencyUnavailableError`; the fixed window is never extended
 * by blocked attempts.
 */
export class LoginRateLimiterService implements LoginRateLimiter {
  private readonly cache: AuthCache;
  private readonly identifierSecret: string;
  private readonly windowSeconds: number;
  private readonly limit: number;

  public constructor(options: LoginRateLimiterOptions) {
    if (options.identifierSecret.length < 32) {
      throw new Error('Login identifier HMAC secret must contain at least 32 characters');
    }
    this.cache = options.cache;
    this.identifierSecret = options.identifierSecret;
    this.windowSeconds = options.windowSeconds ?? 900;
    this.limit = options.limit ?? 6;
  }

  public async inspect(normalizedEmail: string): Promise<void> {
    const window = await this.guard(() => this.cache.readLoginFailures(this.hash(normalizedEmail)));
    if (window.count >= this.limit) throw new LoginRateLimitError(retryAfter(window.ttlSeconds));
  }

  public async recordFailure(normalizedEmail: string): Promise<void> {
    const window = await this.guard(() =>
      this.cache.recordLoginFailure(this.hash(normalizedEmail), this.windowSeconds),
    );
    if (window.count >= this.limit) throw new LoginRateLimitError(retryAfter(window.ttlSeconds));
  }

  public async clear(normalizedEmail: string): Promise<void> {
    await this.guard(() => this.cache.clearLoginFailures(this.hash(normalizedEmail)));
  }

  private hash(normalizedEmail: string): string {
    return createHmac('sha256', this.identifierSecret)
      .update(normalizedEmail.trim().toLowerCase())
      .digest('hex');
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof LoginRateLimitError || error instanceof DependencyUnavailableError) {
        throw error;
      }
      throw new DependencyUnavailableError('redis');
    }
  }
}

function retryAfter(ttlSeconds: number): number {
  return Math.max(1, Math.ceil(ttlSeconds));
}
