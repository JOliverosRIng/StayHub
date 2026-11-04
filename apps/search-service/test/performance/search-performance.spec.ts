import Redis from 'ioredis';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
import { PostgreSqlSearchIndexAdapter } from '../../src/infrastructure/search/postgresql-search-index.adapter';
import { RedisSearchCacheAdapter } from '../../src/infrastructure/cache/redis-search-cache.adapter';
import { SearchAccommodations } from '../../src/application/search/search-accommodations.use-case';
import { SuggestSearchTerms } from '../../src/application/suggestions/suggest-search-terms.use-case';
import { searchTestDatabaseUrl, searchTestRedisUrl } from '../helpers/dependencies';
import {
  SEARCH_PERFORMANCE_PROFILE, performanceSearchMix, performanceSuggestionMix, seedPerformanceDatasetSql,
} from '../fixtures/performance-dataset';

const describeWithDependencies = searchTestDatabaseUrl && searchTestRedisUrl ? describe : describe.skip;

type Operation = 'search' | 'suggest';
interface Work { readonly operation: Operation; readonly action: () => Promise<unknown> }
interface Measurement { readonly operation: Operation; readonly durationMs: number; readonly error?: unknown }
function p95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}
async function measure(work: readonly Work[]): Promise<Measurement[]> {
  return Promise.all(work.map(async ({ operation, action }) => {
    const started = performance.now();
    try { await action(); return { operation, durationMs: performance.now() - started }; }
    catch (error) { return { operation, durationMs: performance.now() - started, error }; }
  }));
}

describeWithDependencies(`Search performance profile ${SEARCH_PERFORMANCE_PROFILE.version}`, () => {
  const prisma = new PrismaClient({ datasourceUrl: searchTestDatabaseUrl! });
  const redis = new Redis(searchTestRedisUrl!, { lazyConnect: true });
  const config = {
    redisUrl: searchTestRedisUrl!, cacheTtlSeconds: 120, cacheJitterSeconds: 1, dependencyTimeoutMs: 2_000,
  } as SearchConfig;
  const index = new PostgreSqlSearchIndexAdapter(prisma as unknown as PrismaService);
  const cache = new RedisSearchCacheAdapter(config, redis);
  const search = new SearchAccommodations(index, cache);
  const suggest = new SuggestSearchTerms(index, cache, 0.2);

  beforeAll(async () => {
    await prisma.$connect();
    await redis.connect();
    for (const statement of seedPerformanceDatasetSql.split(';').map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
    await redis.flushdb();
  });
  afterAll(async () => { await redis.quit(); await prisma.$disconnect(); });

  it('declares a reproducible dataset, workload, concurrency and resource envelope', async () => {
    expect(await prisma.searchDocument.count()).toBe(SEARCH_PERFORMANCE_PROFILE.datasetSize);
    expect(SEARCH_PERFORMANCE_PROFILE.concurrency).toBeGreaterThan(1);
    expect(typeof SEARCH_PERFORMANCE_PROFILE.resources.cpu).toBe('string');
    expect(typeof SEARCH_PERFORMANCE_PROFILE.resources.memory).toBe('string');
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    expect(indexes.map(({ indexname }) => indexname)).toEqual(expect.arrayContaining(['search_documents_search_vector_idx', 'search_documents_name_trgm_idx']));
  });

  it('keeps mixed cold and hot search/suggest traffic below the p95 and error gates', async () => {
    const operation = (indexValue: number): Work => {
      if (indexValue % 5 === 4) return { operation: 'suggest', action: async (): Promise<unknown> => suggest.execute(performanceSuggestionMix[indexValue % performanceSuggestionMix.length]!) };
      return { operation: 'search', action: async (): Promise<unknown> => search.execute(performanceSearchMix[indexValue % performanceSearchMix.length]!) };
    };

    for (let indexValue = 0; indexValue < SEARCH_PERFORMANCE_PROFILE.warmupRequests; indexValue += 1) await operation(indexValue).action();
    await redis.flushdb();
    const cold = await measure(Array.from({ length: SEARCH_PERFORMANCE_PROFILE.concurrency }, (_, indexValue) => operation(indexValue)));
    const hot = await measure(Array.from({ length: SEARCH_PERFORMANCE_PROFILE.measuredRequests }, (_, indexValue) => operation(indexValue)));
    const measurements = [...cold, ...hot];
    const report = Object.fromEntries((['search', 'suggest'] as const).map((name) => {
      const samples = measurements.filter(({ operation: measured }) => measured === name);
      const errorRate = samples.filter(({ error }) => error !== undefined).length / samples.length;
      const measuredP95 = p95(samples.map(({ durationMs }) => durationMs));
      expect(errorRate).toBeLessThan(SEARCH_PERFORMANCE_PROFILE.gates.unexpectedErrorRate);
      expect(measuredP95).toBeLessThan(SEARCH_PERFORMANCE_PROFILE.gates.p95Ms);
      return [name, { samples: samples.length, p95Ms: Number(measuredP95.toFixed(2)), errorRate }];
    }));
    console.info('SEARCH_PERFORMANCE_RESULT', JSON.stringify({ profile: SEARCH_PERFORMANCE_PROFILE.version, ...report }));
  });
});
