import type { SuggestionCachePort } from "../ports/search-cache.port";
import type { SuggestionIndexPort } from "../ports/search-index.port";
import {
  createSuggestionQuery,
  publicSuggestions,
  type SuggestionQuery,
  type SuggestionResponse,
} from "@search/domain/suggestion";

export class SuggestSearchTerms {
  public constructor(
    private readonly index: SuggestionIndexPort,
    private readonly cache: SuggestionCachePort,
    private readonly similarityThreshold: number,
    private readonly limitMax = 20,
  ) {}

  public async execute(query: SuggestionQuery): Promise<SuggestionResponse> {
    query = createSuggestionQuery(query, this.limitMax);
    const generation = await this.index.cacheGeneration();
    const key = this.cache.suggestionKey(generation, query);
    const cached = await this.cache.getSuggestions(key);
    if (cached) return cached;
    const candidates = await this.index.suggest(
      query,
      this.similarityThreshold,
    );
    const response = publicSuggestions(
      candidates,
      query,
      this.similarityThreshold,
    );
    await this.cache.setSuggestions(key, response);
    return response;
  }
}
