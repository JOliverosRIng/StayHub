import { act, renderHook, waitFor } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/msw/server';
import { problem } from '../../test/msw/handlers';
import { PROPERTY_IDS } from '../../test/msw/fixtures';
import { createQueryWrapper } from '../../test/utils';
import { ApiError } from './identity';
import {
  normalizeSearchFilters, parseSearchParams, searchErrorMessage, searchProperties, sortByRelevance,
  suggestSearchTerms, toSearchParams, useSearch, useSearchSuggestions, validateSearchFilters,
} from './search';
import type { SearchResult } from '../types/catalog';

const emptyPage = { items: [], page: 1, pageSize: 20, total: 0, hasNext: false, availabilityKind: null };

function captureSearch(body: object = emptyPage) {
  const urls: URL[] = [];
  server.use(mock.get('*/api/v1/search', ({ request }) => { urls.push(new URL(request.url)); return HttpResponse.json(body); }));
  return urls;
}

describe('search filter serialization', () => {
  it('sends every contract filter with repeated amenities and trimmed text', async () => {
    const urls = captureSearch();
    await searchProperties({
      q: '  hotel playa ', location: ' Cartagena ', minPrice: 50, maxPrice: 300, currency: 'USD',
      checkIn: '2026-12-01', checkOut: '2026-12-05', guests: 2, amenities: ['WIFI', 'pool', 'wifi'], page: 2, pageSize: 10,
    });
    const params = urls[0]!.searchParams;
    expect(urls[0]!.pathname).toBe('/api/v1/search');
    expect(params.get('q')).toBe('hotel playa');
    expect(params.get('location')).toBe('Cartagena');
    expect(params.get('minPrice')).toBe('50');
    expect(params.get('maxPrice')).toBe('300');
    expect(params.get('currency')).toBe('USD');
    expect(params.get('checkIn')).toBe('2026-12-01');
    expect(params.get('checkOut')).toBe('2026-12-05');
    expect(params.get('guests')).toBe('2');
    expect(params.getAll('amenities')).toEqual(['pool', 'wifi']);
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('10');
  });

  it('omits empty filters and drops currency when no price bound is sent', async () => {
    const urls = captureSearch();
    await searchProperties({ q: '   ', location: '', currency: 'USD', amenities: [], page: 1 });
    expect([...urls[0]!.searchParams.keys()]).toEqual([]);
  });

  it('round-trips URL search params used by the search page', () => {
    const filters = { q: 'mar', guests: 3, amenities: ['pool', 'wifi'], minPrice: 10, currency: 'EUR', page: 2 };
    expect(parseSearchParams(toSearchParams(filters))).toEqual(normalizeSearchFilters(filters));
    expect(parseSearchParams(new URLSearchParams('guests=abc&page=-1&minPrice=x'))).toEqual({});
  });
});

describe('search filter validation', () => {
  it.each([
    [{ minPrice: 300, maxPrice: 100, currency: 'USD' }, 'maxPrice'],
    [{ minPrice: -1, currency: 'USD' }, 'minPrice'],
    [{ minPrice: 10, currency: 'usd' }, 'currency'],
    [{ checkIn: '2026-12-05', checkOut: '2026-12-01' }, 'checkOut'],
    [{ checkIn: '2026-12-05' }, 'checkOut'],
    [{ checkOut: '2026-12-05' }, 'checkIn'],
    [{ guests: 0 }, 'guests'],
    [{ q: 'x'.repeat(201) }, 'q'],
    [{ amenities: Array.from({ length: 21 }, (_, i) => `a${i}`) }, 'amenities'],
  ])('rejects %j on %s before calling the API', (filters, field) => {
    expect(validateSearchFilters(filters)).toHaveProperty(field);
  });

  it('accepts a complete valid filter set', () => {
    expect(validateSearchFilters({ q: 'mar', minPrice: 0, maxPrice: 10, currency: 'USD', checkIn: '2026-12-01', checkOut: '2026-12-02', guests: 1 })).toEqual({});
  });
});

describe('search results', () => {
  it('returns published results ordered by relevance with accommodationId tie-break', async () => {
    const page = await searchProperties({ q: 'hotel' });
    expect(page.items.map((i) => i.accommodationId)).toEqual([PROPERTY_IDS.hotelCentro, PROPERTY_IDS.villa]);
    expect(page.items[0]!.relevance).toBeGreaterThan(page.items[1]!.relevance);
  });

  it('sorts defensively when the server page is out of order', () => {
    const item = (accommodationId: string, relevance: number) => ({ accommodationId, relevance }) as SearchResult;
    expect(sortByRelevance([item('b', 1), item('c', 2), item('a', 1)]).map((i) => i.accommodationId)).toEqual(['c', 'a', 'b']);
  });

  it('suggests indexed names and locations and skips blank queries', async () => {
    const urls: URL[] = [];
    server.events.on('request:start', ({ request }) => { urls.push(new URL(request.url)); });
    const items = await suggestSearchTerms('cart', 5);
    expect(items).toContainEqual({ text: 'Cartagena', type: 'LOCATION' });
    expect(urls[0]!.searchParams.get('limit')).toBe('5');
    expect(await suggestSearchTerms('  ')).toEqual([]);
    expect(urls).toHaveLength(1);
    server.events.removeAllListeners();
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const pending = searchProperties({ q: 'hotel' }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'CanceledError' });
  });
});

describe('search error mapping', () => {
  it('maps contract validation errors to ApiError with field details and a filter message', async () => {
    const error = await searchProperties({ minPrice: 10 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR', errors: [{ field: 'currency' }] } });
    expect(searchErrorMessage(error)).toBe('Revisa los filtros de búsqueda.');
  });

  it.each([
    [503, 'La búsqueda no está disponible en este momento. Intenta nuevamente.'],
    [429, 'Demasiadas búsquedas seguidas. Espera 7 segundos.'],
    [500, 'La búsqueda no está disponible en este momento. Intenta nuevamente.'],
  ])('maps HTTP %i without exposing server detail', async (status, message) => {
    server.use(mock.get('*/api/v1/search', () => {
      const response = problem(status, `HTTP_${status}`);
      if (status === 429) response.headers.set('Retry-After', '7');
      return response;
    }));
    const error = await searchProperties({ q: 'x' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status });
    expect(searchErrorMessage(error)).toBe(message);
  });

  it('maps network failures to a safe unavailable error', async () => {
    server.use(mock.get('*/api/v1/search', () => HttpResponse.error()));
    const error = await searchProperties({ q: 'x' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0 });
    expect(searchErrorMessage(error)).toMatch(/no está disponible/);
  });
});

describe('search hooks', () => {
  const wrapper = () => createQueryWrapper();

  it('loads the initial keywords at once and coalesces later keystrokes into one request', async () => {
    const urls = captureSearch();
    const { result, rerender } = renderHook(({ q }) => useSearch({ q }, { debounceMs: 50 }), { wrapper: wrapper(), initialProps: { q: 'h' } });
    rerender({ q: 'ho' }); rerender({ q: 'hot' }); rerender({ q: 'hotel' });
    await waitFor(() => expect(urls.map((u) => u.searchParams.get('q'))).toContain('hotel'));
    await waitFor(() => expect(result.current.filters.q).toBe('hotel'));
    expect(urls.map((u) => u.searchParams.get('q'))).toEqual(['h', 'hotel']);
  });

  it('does not call the API while filters are invalid', async () => {
    const urls = captureSearch();
    const { result } = renderHook(() => useSearch({ guests: 0 }, { debounceMs: 0 }), { wrapper: wrapper() });
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(result.current.validation).toHaveProperty('guests');
    expect(result.current.fetchStatus).toBe('idle');
    expect(urls).toHaveLength(0);
  });

  it('loads suggestions only from two characters', async () => {
    const { result, rerender } = renderHook(({ q }) => useSearchSuggestions(q, { debounceMs: 0 }), { wrapper: wrapper(), initialProps: { q: 'c' } });
    expect(result.current.fetchStatus).toBe('idle');
    rerender({ q: 'cabañ' });
    await waitFor(() => expect(result.current.data).toContainEqual({ text: 'Cabaña del Bosque Nevado', type: 'PROPERTY' }));
  });
});
