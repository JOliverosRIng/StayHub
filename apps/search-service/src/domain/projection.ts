export interface GeoPoint { readonly latitude: number; readonly longitude: number; }
export interface SearchDocument {
  readonly accommodationId: string; readonly projectionVersion: bigint; readonly published: boolean; readonly name: string; readonly description: string;
  readonly countryCode: string; readonly region: string | null; readonly city: string; readonly addressSummary: string | null; readonly location: GeoPoint | null;
  readonly minNightlyPrice: number; readonly currency: string; readonly capacity: number; readonly amenities: readonly string[]; readonly keywords: readonly string[];
  readonly primaryPhotoUrl: string | null; readonly sourceUpdatedAt: Date; readonly indexedAt: Date;
}
export function normalizeTerms(values: readonly string[], maxItems = 100): readonly string[] {
  const normalized = [...new Set(values.map((value) => value.trim().toLocaleLowerCase('es')).filter(Boolean))];
  if (normalized.length > maxItems) throw new Error(`Too many terms; maximum is ${maxItems}`);
  return Object.freeze(normalized);
}
