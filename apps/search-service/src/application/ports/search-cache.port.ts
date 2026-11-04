import type { SearchPage } from "@search/domain/search-result";
import type {
  SuggestionQuery,
  SuggestionResponse,
} from "@search/domain/suggestion";
export const SEARCH_CACHE_PORT = Symbol("SEARCH_CACHE_PORT");
export const SUGGESTION_CACHE_PORT = Symbol("SUGGESTION_CACHE_PORT");

export interface SearchCachePort {
  key(generation: bigint, normalized: unknown): string;
  get(key: string): Promise<SearchPage | null>;
  set(key: string, value: SearchPage): Promise<void>;
  health(): Promise<boolean>;
}

export interface SuggestionCachePort {
  suggestionKey(generation: bigint, query: SuggestionQuery): string;
  getSuggestions(key: string): Promise<SuggestionResponse | null>;
  setSuggestions(key: string, value: SuggestionResponse): Promise<void>;
}
