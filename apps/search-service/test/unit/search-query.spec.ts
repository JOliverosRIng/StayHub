import { createSearchQuery } from '../../src/domain/search-query';
import type { SearchQueryInput } from '../../src/domain/search-query';
import { SearchApplicationError } from '../../src/application/errors/search-errors';

describe('SearchQuery', () => {
  it('normalizes defaults, text and amenities', () => {
    expect(createSearchQuery({ q: '  hotel   piscina ', amenities: [' WiFi ', 'wifi', 'Piscina'] })).toEqual({ q: 'hotel piscina', amenities: ['wifi', 'piscina'], page: 1, pageSize: 20 });
  });
  it.each<SearchQueryInput>([
    { minPrice: -1 }, { minPrice: 10 }, { minPrice: 20, maxPrice: 10, currency: 'COP' }, { checkIn: '2026-12-01' },
    { checkIn: '2026-12-02', checkOut: '2026-12-01' }, { guests: 0 }, { page: 0 }, { pageSize: 101 },
  ])('rejects invalid input %o', (input) => { expect(() => createSearchQuery(input)).toThrow(SearchApplicationError); });
  it('requires one ISO currency per price query', () => { expect(createSearchQuery({ minPrice: 0, maxPrice: 100, currency: 'cop' }).currency).toBe('COP'); });
  it('uses AND-ready unique normalized amenities', () => { expect(createSearchQuery({ amenities: ['wifi', 'pool', 'wifi'] }).amenities).toEqual(['wifi', 'pool']); });
});
