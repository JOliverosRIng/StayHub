export interface SearchResult {
  readonly accommodationId: string; readonly name: string; readonly location: string; readonly minNightlyPrice: number; readonly currency: string;
  readonly capacity: number; readonly amenities: readonly string[]; readonly primaryPhotoUrl: string | null; readonly relevance: number;
}
export interface SearchPage {
  readonly items: readonly SearchResult[]; readonly page: number; readonly pageSize: number; readonly total: number; readonly hasNext: boolean; readonly availabilityKind: 'PROJECTED' | null;
}
export function createSearchPage(items: readonly SearchResult[], page: number, pageSize: number, total: number, datesFiltered: boolean): SearchPage {
  return Object.freeze({ items: Object.freeze([...items]), page, pageSize, total, hasNext: page * pageSize < total, availabilityKind: datesFiltered ? 'PROJECTED' : null });
}
