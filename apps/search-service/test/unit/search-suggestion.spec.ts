import type { SuggestionCachePort } from '../../src/application/ports/search-cache.port';
import type { SuggestionIndexPort } from '../../src/application/ports/search-index.port';
import { SuggestSearchTerms } from '../../src/application/suggestions/suggest-search-terms.use-case';
import {
  createSuggestionQuery,
  publicSuggestions,
} from '../../src/domain/suggestion';
import { SearchApplicationError } from '../../src/application/errors/search-errors';

describe('search suggestions', () => {
  it('normalizes the term and applies the default limit', () => {
    expect(createSuggestionQuery({ q: '  BoGOTÁ   centro  ' })).toEqual({
      q: 'bogotá centro',
      limit: 10,
    });
  });

  it.each([
    { q: '' },
    { q: ' '.repeat(4) },
    { q: 'x'.repeat(121) },
    { q: 'casa', limit: 0 },
    { q: 'casa', limit: 21 },
  ])('rejects query outside q 1-120 or limit 1-20: %o', (input) => {
    expect(() => createSuggestionQuery(input)).toThrow(SearchApplicationError);
  });

  it('deduplicates by normalized text and type, honors threshold and orders deterministically', () => {
    const response = publicSuggestions(
      [
        { text: 'Bogotá', type: 'LOCATION', score: 0.8 },
        { text: ' bogotá ', type: 'LOCATION', score: 0.9 },
        { text: 'Bogotá', type: 'PROPERTY', score: 0.9 },
        { text: 'Casa Sol', type: 'PROPERTY', score: 0.2 },
        { text: 'Casa Luna', type: 'PROPERTY', score: 0.9 },
      ],
      createSuggestionQuery({ q: 'bogota', limit: 3 }),
      0.3,
    );
    expect(response).toEqual({
      items: [
        { text: 'bogotá', type: 'LOCATION' },
        { text: 'Bogotá', type: 'PROPERTY' },
        { text: 'Casa Luna', type: 'PROPERTY' },
      ],
    });
    expect(response.items[0]).not.toHaveProperty('score');
  });

  it('uses best-effort cache and never adds personalization inputs', async () => {
    const query = createSuggestionQuery({ q: 'bogta', limit: 2 });
    const suggest = jest.fn().mockResolvedValue([
      { text: 'Bogotá', type: 'LOCATION', score: 0.7 },
    ]);
    const index: jest.Mocked<SuggestionIndexPort> = {
      cacheGeneration: jest.fn().mockResolvedValue(3n),
      suggest,
    };
    const suggestionKey = jest.fn().mockReturnValue('suggest:v1:3:key');
    const setSuggestions = jest.fn().mockResolvedValue(undefined);
    const cache: jest.Mocked<SuggestionCachePort> = {
      suggestionKey,
      getSuggestions: jest.fn().mockResolvedValue(null),
      setSuggestions,
    };
    const result = await new SuggestSearchTerms(index, cache, 0.3).execute(query);
    expect(suggest).toHaveBeenCalledWith(query, 0.3);
    expect(suggestionKey).toHaveBeenCalledWith(3n, query);
    expect(setSuggestions).toHaveBeenCalledWith('suggest:v1:3:key', result);
    expect(result).toEqual({ items: [{ text: 'Bogotá', type: 'LOCATION' }] });
  });

  it('returns a sanitized cache hit without querying PostgreSQL', async () => {
    const cached = { items: [{ text: 'Bogotá', type: 'LOCATION' as const }] };
    const suggest = jest.fn();
    const index: jest.Mocked<SuggestionIndexPort> = {
      cacheGeneration: jest.fn().mockResolvedValue(4n),
      suggest,
    };
    const cache: jest.Mocked<SuggestionCachePort> = {
      suggestionKey: jest.fn().mockReturnValue('suggest:v1:4:key'),
      getSuggestions: jest.fn().mockResolvedValue(cached),
      setSuggestions: jest.fn(),
    };
    await expect(
      new SuggestSearchTerms(index, cache, 0.3).execute(
        createSuggestionQuery({ q: 'bogta' }),
      ),
    ).resolves.toBe(cached);
    expect(suggest).not.toHaveBeenCalled();
  });
});
