import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import type { AuthCache } from '@auth/application/ports/cache.port';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

@Injectable()
export class AuthCacheAdapter implements AuthCache, OnModuleDestroy {
  private readonly redis: Redis;

  public constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    this.redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  public async incrementLoginFailure(identifierHash: string, windowSeconds: number): Promise<number> {
    await this.connect();
    const key = `auth:login-failures:${identifierHash}`;
    const results = await this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
    const increment = results?.[0];
    if (increment === undefined || increment[0] !== null || typeof increment[1] !== 'number') {
      throw new Error('Redis login failure counter failed');
    }
    return increment[1];
  }

  public async clearLoginFailures(identifierHash: string): Promise<void> {
    await this.connect();
    await this.redis.del(`auth:login-failures:${identifierHash}`);
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
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private async connect(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}

