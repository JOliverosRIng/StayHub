import type { SearchPage } from '@search/domain/search-result';
export const SEARCH_CACHE_PORT = Symbol('SEARCH_CACHE_PORT');
export interface SearchCachePort { key(generation: bigint, normalized: unknown): string; get(key: string): Promise<SearchPage | null>; set(key: string, value: SearchPage): Promise<void>; health(): Promise<boolean>; }
