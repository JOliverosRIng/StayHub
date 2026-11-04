import type { SearchQuery } from '@search/domain/search-query';
import type { SearchPage } from '@search/domain/search-result';
export const SEARCH_INDEX_PORT = Symbol('SEARCH_INDEX_PORT');
export interface SearchIndexPort { search(query: SearchQuery): Promise<SearchPage>; health(): Promise<boolean>; cacheGeneration(): Promise<bigint>; }
