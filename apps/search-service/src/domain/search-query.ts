import { SearchApplicationError } from '@search/application/errors/search-errors';
import { normalizeTerms } from './projection';

export interface SearchQuery {
  readonly q?: string; readonly location?: string; readonly minPrice?: number; readonly maxPrice?: number; readonly currency?: string;
  readonly checkIn?: string; readonly checkOut?: string; readonly guests?: number; readonly amenities: readonly string[]; readonly page: number; readonly pageSize: number;
}
export interface SearchQueryInput { q?: string; location?: string; minPrice?: number; maxPrice?: number; currency?: string; checkIn?: string; checkOut?: string; guests?: number; amenities?: readonly string[]; page?: number; pageSize?: number; }

function optionalText(field: string, value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < 1 || normalized.length > max) throw invalid(field, `must contain 1 to ${max} characters`);
  return normalized;
}
function invalid(field: string, code: string): SearchApplicationError { return new SearchApplicationError('SEARCH_VALIDATION_FAILED', 'Invalid search query.', 400, [{ field, code }]); }
export function createSearchQuery(input: SearchQueryInput): SearchQuery {
  const q = optionalText('q', input.q, 200); const location = optionalText('location', input.location, 120);
  const page = input.page ?? 1; const pageSize = input.pageSize ?? 20;
  if (!Number.isSafeInteger(page) || page < 1) throw invalid('page', 'MIN_1');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw invalid('pageSize', 'RANGE_1_100');
  if (input.minPrice !== undefined && (!Number.isFinite(input.minPrice) || input.minPrice < 0)) throw invalid('minPrice', 'NON_NEGATIVE');
  if (input.maxPrice !== undefined && (!Number.isFinite(input.maxPrice) || input.maxPrice < 0)) throw invalid('maxPrice', 'NON_NEGATIVE');
  if (input.minPrice !== undefined && input.maxPrice !== undefined && input.minPrice > input.maxPrice) throw invalid('minPrice', 'GREATER_THAN_MAX');
  const hasPrice = input.minPrice !== undefined || input.maxPrice !== undefined;
  const currency = input.currency?.trim().toUpperCase();
  if (hasPrice && !currency) throw invalid('currency', 'REQUIRED_WITH_PRICE');
  if (currency !== undefined && !/^[A-Z]{3}$/u.test(currency)) throw invalid('currency', 'ISO_4217');
  const hasAnyDate = input.checkIn !== undefined || input.checkOut !== undefined;
  if (hasAnyDate && (!input.checkIn || !input.checkOut)) throw invalid('checkIn', 'DATES_MUST_APPEAR_TOGETHER');
  if (input.checkIn && input.checkOut && input.checkOut <= input.checkIn) throw invalid('checkOut', 'MUST_BE_AFTER_CHECK_IN');
  if (input.guests !== undefined && (!Number.isSafeInteger(input.guests) || input.guests < 1)) throw invalid('guests', 'MIN_1');
  const amenities = normalizeTerms(input.amenities ?? [], 100);
  return Object.freeze({ ...(q === undefined ? {} : { q }), ...(location === undefined ? {} : { location }),
    ...(input.minPrice === undefined ? {} : { minPrice: input.minPrice }), ...(input.maxPrice === undefined ? {} : { maxPrice: input.maxPrice }), ...(currency === undefined ? {} : { currency }),
    ...(input.checkIn === undefined ? {} : { checkIn: input.checkIn }), ...(input.checkOut === undefined ? {} : { checkOut: input.checkOut }), ...(input.guests === undefined ? {} : { guests: input.guests }), amenities, page, pageSize });
}
