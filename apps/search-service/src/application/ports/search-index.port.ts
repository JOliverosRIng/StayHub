import type { SearchQuery } from "@search/domain/search-query";
import type { SearchPage } from "@search/domain/search-result";
import type {
  SearchSuggestion,
  SuggestionQuery,
} from "@search/domain/suggestion";
export const SEARCH_INDEX_PORT = Symbol("SEARCH_INDEX_PORT");
export const SUGGESTION_INDEX_PORT = Symbol("SUGGESTION_INDEX_PORT");

export interface SearchIndexPort {
  search(query: SearchQuery): Promise<SearchPage>;
  health(): Promise<boolean>;
  cacheGeneration(): Promise<bigint>;
}

export interface SuggestionIndexPort {
  suggest(
    query: SuggestionQuery,
    similarityThreshold: number,
  ): Promise<readonly SearchSuggestion[]>;
  cacheGeneration(): Promise<bigint>;
}
