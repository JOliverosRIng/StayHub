import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { http } from './http';
import { ApiError } from './identity';
import {
  CURRENCY_PATTERN, SEARCH_LIMITS,
  type SearchFilters, type SearchResponse, type SearchResult, type SearchSuggestion, type SearchSuggestResponse,
} from '../types/catalog';

/**
 * Client for `GET /search` and `GET /search/suggest` through the Gateway (External dependency: G1
 * must expose Search). Filters are normalized once so React Query keys, URLs and requests agree.
 */

export const searchKeys = {
  all: ['search'] as const,
  results: (filters: SearchFilters) => [...searchKeys.all, 'results', filters] as const,
  suggestions: (q: string, limit: number) => [...searchKeys.all, 'suggest', q, limit] as const,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: string | undefined) => value?.trim() || undefined;
const finite = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? undefined : value);

/** Trims text, removes empty values, lower-cases and sorts amenities and keeps currency only with a price bound. */
export function normalizeSearchFilters(filters: SearchFilters): SearchFilters {
  const minPrice = finite(filters.minPrice);
  const maxPrice = finite(filters.maxPrice);
  const amenities = [...new Set((filters.amenities ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean))].sort();
  const result: SearchFilters = {
    q: text(filters.q),
    location: text(filters.location),
    minPrice,
    maxPrice,
    currency: minPrice !== undefined || maxPrice !== undefined ? text(filters.currency) : undefined,
    checkIn: text(filters.checkIn),
    checkOut: text(filters.checkOut),
    guests: finite(filters.guests),
    amenities: amenities.length ? amenities : undefined,
    page: filters.page && filters.page !== 1 ? filters.page : undefined,
    pageSize: finite(filters.pageSize),
  };
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined)) as SearchFilters;
}

export type SearchValidation = Partial<Record<keyof SearchFilters, string>>;

/** Mirrors the search contract so invalid combinations never reach the network. */
export function validateSearchFilters(filters: SearchFilters): SearchValidation {
  const f = normalizeSearchFilters(filters);
  const errors: SearchValidation = {};
  if (f.q && f.q.length > SEARCH_LIMITS.qMaxLength) errors.q = `Usa hasta ${SEARCH_LIMITS.qMaxLength} caracteres.`;
  if (f.location && f.location.length > SEARCH_LIMITS.locationMaxLength) errors.location = `Usa hasta ${SEARCH_LIMITS.locationMaxLength} caracteres.`;
  if (f.minPrice !== undefined && f.minPrice < 0) errors.minPrice = 'El precio mínimo no puede ser negativo.';
  if (f.maxPrice !== undefined && f.maxPrice < 0) errors.maxPrice = 'El precio máximo no puede ser negativo.';
  if (f.minPrice !== undefined && f.maxPrice !== undefined && f.minPrice > f.maxPrice) errors.maxPrice = 'El precio máximo debe ser mayor o igual al mínimo.';
  if ((f.minPrice !== undefined || f.maxPrice !== undefined) && !CURRENCY_PATTERN.test(f.currency ?? '')) errors.currency = 'Selecciona la moneda del rango de precio.';
  if (f.checkIn && !DATE.test(f.checkIn)) errors.checkIn = 'Fecha de entrada inválida.';
  if (f.checkOut && !DATE.test(f.checkOut)) errors.checkOut = 'Fecha de salida inválida.';
  if (f.checkOut && !f.checkIn) errors.checkIn = 'Indica también la fecha de entrada.';
  if (f.checkIn && !f.checkOut) errors.checkOut = 'Indica también la fecha de salida.';
  if (f.checkIn && f.checkOut && f.checkOut <= f.checkIn) errors.checkOut = 'La salida debe ser posterior a la entrada.';
  if (f.guests !== undefined && (!Number.isInteger(f.guests) || f.guests < 1)) errors.guests = 'Indica al menos 1 huésped.';
  if (f.amenities && f.amenities.length > SEARCH_LIMITS.amenitiesMax) errors.amenities = `Selecciona hasta ${SEARCH_LIMITS.amenitiesMax} amenidades.`;
  if (f.amenities?.some((a) => a.length > SEARCH_LIMITS.amenityMaxLength)) errors.amenities = 'Amenidad inválida.';
  if (f.page !== undefined && (!Number.isInteger(f.page) || f.page < 1)) errors.page = 'Página inválida.';
  if (f.pageSize !== undefined && (!Number.isInteger(f.pageSize) || f.pageSize < 1 || f.pageSize > SEARCH_LIMITS.pageSizeMax)) errors.pageSize = 'Tamaño de página inválido.';
  return errors;
}

const ORDER: (keyof SearchFilters)[] = ['q', 'location', 'checkIn', 'checkOut', 'guests', 'minPrice', 'maxPrice', 'currency', 'amenities', 'page', 'pageSize'];

/** Contract query string: `amenities` repeats (`style: form, explode: true`). */
export function toSearchParams(filters: SearchFilters): URLSearchParams {
  const f = normalizeSearchFilters(filters);
  const params = new URLSearchParams();
  for (const key of ORDER) {
    const value = f[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, String(value));
  }
  return params;
}

/** Reads filters from a page URL; malformed numbers are ignored rather than sent. */
export function parseSearchParams(params: URLSearchParams): SearchFilters {
  const int = (key: string) => { const v = params.get(key); return v !== null && /^\d+$/.test(v) ? Number(v) : undefined; };
  const num = (key: string) => { const v = params.get(key); return v !== null && /^\d+(\.\d+)?$/.test(v) ? Number(v) : undefined; };
  return normalizeSearchFilters({
    q: params.get('q') ?? undefined,
    location: params.get('location') ?? undefined,
    checkIn: params.get('checkIn') ?? undefined,
    checkOut: params.get('checkOut') ?? undefined,
    guests: int('guests'),
    minPrice: num('minPrice'),
    maxPrice: num('maxPrice'),
    currency: params.get('currency') ?? undefined,
    amenities: params.getAll('amenities'),
    page: int('page') || undefined,
    pageSize: int('pageSize') || undefined,
  });
}

/** Server order is authoritative; this only guards against out-of-order pages. Stable tie-break by id. */
export function sortByRelevance(items: readonly SearchResult[]): SearchResult[] {
  return [...items].sort((a, b) => b.relevance - a.relevance || a.accommodationId.localeCompare(b.accommodationId));
}

export async function searchProperties(filters: SearchFilters, signal?: AbortSignal): Promise<SearchResponse> {
  const { data } = await http.get<SearchResponse>('/search', { params: toSearchParams(filters), signal });
  return { ...data, items: sortByRelevance(data.items) };
}

export async function suggestSearchTerms(q: string, limit = 8, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  const term = q.trim().slice(0, SEARCH_LIMITS.suggestQueryMaxLength);
  if (!term) return [];
  const { data } = await http.get<SearchSuggestResponse>('/search/suggest', {
    params: { q: term, limit: Math.min(Math.max(1, limit), SEARCH_LIMITS.suggestLimitMax) }, signal,
  });
  return data.items;
}

/** Safe, search-specific copy for an error. Server `detail` is never displayed. */
export function searchErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Revisa los filtros de búsqueda.';
    if (error.status === 429) return `Demasiadas búsquedas seguidas.${error.retryAfter ? ` Espera ${error.retryAfter} segundos.` : ' Intenta más tarde.'}`;
  }
  return 'La búsqueda no está disponible en este momento. Intenta nuevamente.';
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) { setDebounced(value); return; }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : debounced;
}

interface SearchOptions { enabled?: boolean; debounceMs?: number }

/**
 * Search results for `filters`. Keywords are debounced (typing), other filters apply immediately.
 * Superseded requests are cancelled through React Query's AbortSignal; the previous page stays
 * visible while the next one loads.
 */
export function useSearch(filters: SearchFilters, { enabled = true, debounceMs = 300 }: SearchOptions = {}) {
  const q = useDebouncedValue(filters.q, debounceMs);
  const normalized = useMemo(() => normalizeSearchFilters({ ...filters, q }), [filters, q]);
  const key = JSON.stringify(normalized);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => normalized, [key]);
  const validation = useMemo(() => validateSearchFilters(stable), [stable]);
  const valid = Object.keys(validation).length === 0;
  const query = useQuery({
    queryKey: searchKeys.results(stable),
    queryFn: ({ signal }) => searchProperties(stable, signal),
    enabled: enabled && valid,
    placeholderData: keepPreviousData,
  });
  return { ...query, validation, filters: stable };
}

export function useSearchSuggestions(q: string, { debounceMs = 250, limit = 8 }: { debounceMs?: number; limit?: number } = {}) {
  const term = useDebouncedValue(q.trim(), debounceMs);
  return useQuery({
    queryKey: searchKeys.suggestions(term, limit),
    queryFn: ({ signal }) => suggestSearchTerms(term, limit, signal),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}
