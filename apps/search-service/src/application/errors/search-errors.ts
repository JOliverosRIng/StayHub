export type SearchErrorCode = 'SEARCH_VALIDATION_FAILED' | 'SEARCH_UNAUTHENTICATED' | 'SEARCH_FORBIDDEN' | 'SEARCH_DEPENDENCY_UNAVAILABLE' | 'SEARCH_EVENT_INVALID' | 'SEARCH_EVENT_REPLAY_CONFLICT';
export class SearchApplicationError extends Error {
  public constructor(public readonly code: SearchErrorCode, message: string, public readonly status: number, public readonly errors: readonly { field: string; code: string }[] = []) { super(message); this.name = 'SearchApplicationError'; }
}
