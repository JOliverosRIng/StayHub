import type { SearchIndexPort } from "../ports/search-index.port";
import type { SearchCachePort } from "../ports/search-cache.port";
import type { SearchQuery } from "@search/domain/search-query";
import type { SearchPage } from "@search/domain/search-result";

export class SearchAccommodations {
  public constructor(
    private readonly index: SearchIndexPort,
    private readonly cache: SearchCachePort,
  ) {}
  public async execute(query: SearchQuery): Promise<SearchPage> {
    const generation = await this.index.cacheGeneration();
    const key = this.cache.key(generation, query);
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const page = await this.index.search(query);
    await this.cache.set(key, page);
    return page;
  }
}
