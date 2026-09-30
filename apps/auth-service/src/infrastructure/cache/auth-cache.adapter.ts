import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import Redis from 'ioredis';

import type { AuthCache, LoginFailureWindow } from '@auth/application/ports/cache.port';
import { DependencyUnavailableError } from '@auth/application/errors/auth-errors';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

const LOGIN_FAILURE_WINDOW_SECONDS = 900;

const READ_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then
  return {0, -2}
end
local count = tonumber(value)
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 and count > 0 and tonumber(ARGV[1]) > 0 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
  ttl = redis.call('PTTL', KEYS[1])
end
return {count, ttl}
`;

const RECORD_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return {count, redis.call('PTTL', KEYS[1])}
`;

@Injectable()
export class AuthCacheAdapter implements AuthCache, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ownsClient: boolean;

  public constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    @Optional() client?: Redis,
  ) {
    this.redis = client ?? new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.ownsClient = client === undefined;
  }

  public async readLoginFailures(identifierHash: string): Promise<LoginFailureWindow> {
    return this.evalWindow(
      READ_SCRIPT,
      `auth:login-failures:${identifierHash}`,
      [LOGIN_FAILURE_WINDOW_SECONDS * 1000],
    );
  }

  public async recordLoginFailure(
    identifierHash: string,
    windowSeconds: number,
  ): Promise<LoginFailureWindow> {
    return this.evalWindow(
      RECORD_SCRIPT,
      `auth:login-failures:${identifierHash}`,
      [windowSeconds * 1000],
    );
  }

  public async clearLoginFailures(identifierHash: string): Promise<void> {
    try {
      await this.connect();
      await this.redis.del(`auth:login-failures:${identifierHash}`);
    } catch {
      throw new DependencyUnavailableError('redis');
    }
  }

  public async getSession<T>(sessionId: string): Promise<T | null> {
    await this.connect();
    const value = await this.redis.get(`auth:session:${sessionId}`);
    return value === null ? null : (JSON.parse(value) as T);
  }

  public async setSession<T>(sessionId: string, value: T, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.connect();
    await this.redis.set(`auth:session:${sessionId}`, JSON.stringify(value), 'EX', ttlSeconds);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.connect();
    await this.redis.del(`auth:session:${sessionId}`);
  }

  public async ping(): Promise<boolean> {
    try {
      await this.connect();
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.ownsClient && this.redis.status !== 'end') await this.redis.quit();
  }

  private async evalWindow(
    script: string,
    key: string,
    args: readonly (string | number)[],
  ): Promise<LoginFailureWindow> {
    let result: unknown;
    try {
      await this.connect();
      result = await this.redis.eval(script, 1, key, ...args);
    } catch {
      throw new DependencyUnavailableError('redis');
    }
    if (!Array.isArray(result) || result.length < 2) {
      throw new DependencyUnavailableError('redis');
    }
    const [count, ttlMillis] = result as [unknown, unknown];
    if (typeof count !== 'number' || typeof ttlMillis !== 'number') {
      throw new DependencyUnavailableError('redis');
    }
    return { count, ttlSeconds: toSeconds(ttlMillis) };
  }

  private async connect(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}

function toSeconds(ttlMillis: number): number {
  return ttlMillis < 0 ? 0 : Math.ceil(ttlMillis / 1000);
}
