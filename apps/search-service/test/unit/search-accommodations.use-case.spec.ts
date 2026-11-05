import { SearchAccommodations } from '../../src/application/search/search-accommodations.use-case';
import type { SearchIndexPort } from '../../src/application/ports/search-index.port';
import type { SearchCachePort } from '../../src/application/ports/search-cache.port';
import { createSearchQuery } from '../../src/domain/search-query';
import { createSearchPage } from '../../src/domain/search-result';
describe('SearchAccommodations', () => {
  const page = createSearchPage([], 1, 20, 0, false);
  it('returns a cache hit without querying PostgreSQL', async () => {
    const search = jest.fn(); const index = { cacheGeneration: jest.fn().mockResolvedValue(2n), search, health: jest.fn() } as jest.Mocked<SearchIndexPort>;
    const cache = { key: jest.fn().mockReturnValue('key'), get: jest.fn().mockResolvedValue(page), set: jest.fn(), health: jest.fn() } as jest.Mocked<SearchCachePort>;
    await expect(new SearchAccommodations(index, cache).execute(createSearchQuery({}))).resolves.toBe(page); expect(search).not.toHaveBeenCalled();
  });
  it('fills cache after an authoritative miss', async () => {
    const index = { cacheGeneration: jest.fn().mockResolvedValue(0n), search: jest.fn().mockResolvedValue(page), health: jest.fn() } as jest.Mocked<SearchIndexPort>;
    const set = jest.fn().mockResolvedValue(undefined); const cache = { key: jest.fn().mockReturnValue('search:v1:0:key'), get: jest.fn().mockResolvedValue(null), set, health: jest.fn() } as jest.Mocked<SearchCachePort>;
    await expect(new SearchAccommodations(index, cache).execute(createSearchQuery({}))).resolves.toBe(page); expect(set).toHaveBeenCalledWith('search:v1:0:key', page);
  });
});
