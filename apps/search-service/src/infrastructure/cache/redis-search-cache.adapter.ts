import { createHash, randomInt } from 'node:crypto';
import Redis from 'ioredis';
import type { SearchCachePort } from '@search/application/ports/search-cache.port';
import type { SearchPage } from '@search/domain/search-result';
import type { SearchConfig } from '../config/search-config';

export class RedisSearchCacheAdapter implements SearchCachePort {
  private readonly redis: Redis;
  public constructor(private readonly config: SearchConfig, redis?: Redis) { this.redis = redis ?? new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: config.dependencyTimeoutMs }); }
  public key(generation: bigint, normalized: unknown): string { return `search:v1:${generation}:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`; }
  public async get(key: string): Promise<SearchPage | null> { try { if (this.redis.status === 'wait') await this.redis.connect(); const raw = await this.redis.get(key); return raw ? JSON.parse(raw) as SearchPage : null; } catch { return null; } }
  public async set(key: string, value: SearchPage): Promise<void> { try { if (this.redis.status === 'wait') await this.redis.connect(); const ttl = this.config.cacheTtlSeconds + randomInt(0, this.config.cacheJitterSeconds + 1); await this.redis.set(key, JSON.stringify(value), 'EX', ttl); } catch { /* Cache is best effort. */ } }
  public async health(): Promise<boolean> { try { if (this.redis.status === 'wait') await this.redis.connect(); return (await this.redis.ping()) === 'PONG'; } catch { return false; } }
}
