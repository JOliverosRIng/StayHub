import Redis from 'ioredis';
import { RedisSearchCacheAdapter } from '../../src/infrastructure/cache/redis-search-cache.adapter';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
import { createSearchPage } from '../../src/domain/search-result';
import { describeWithRedis, searchTestRedisUrl } from '../helpers/dependencies';
describeWithRedis('RedisSearchCacheAdapter', () => {
  const redis = new Redis(searchTestRedisUrl ?? '', { lazyConnect: true });
  const adapter = new RedisSearchCacheAdapter({ redisUrl: searchTestRedisUrl, cacheTtlSeconds: 2, cacheJitterSeconds: 1, dependencyTimeoutMs: 500 } as SearchConfig, redis);
  beforeAll(async () => { await redis.connect(); await redis.flushdb(); }); afterAll(async () => redis.quit());
  it('fills and reads the canonical versioned key', async () => { const key = adapter.key(1n, { page: 1 }); const page = createSearchPage([], 1, 20, 0, false); expect(await adapter.get(key)).toBeNull(); await adapter.set(key, page); await expect(adapter.get(key)).resolves.toEqual(page); });
  it('changes keys with generation and canonical query', () => { expect(adapter.key(1n, { q: 'a' })).not.toBe(adapter.key(2n, { q: 'a' })); });
  it('stores only sanitized public suggestions and ignores corrupt JSON', async () => {
    const key = adapter.suggestionKey(1n, { q: 'bogta', limit: 10 });
    await adapter.setSuggestions(key, { items: [{ text: 'Bogotá', type: 'LOCATION' }] });
    await expect(adapter.getSuggestions(key)).resolves.toEqual({ items: [{ text: 'Bogotá', type: 'LOCATION' }] });
    await redis.set(key, JSON.stringify({ items: [{ text: 'Bogotá', type: 'LOCATION', score: 1, addressSummary: 'private' }] }));
    await expect(adapter.getSuggestions(key)).resolves.toEqual({ items: [{ text: 'Bogotá', type: 'LOCATION' }] });
    await redis.set(key, '{invalid');
    await expect(adapter.getSuggestions(key)).resolves.toBeNull();
  });
});
