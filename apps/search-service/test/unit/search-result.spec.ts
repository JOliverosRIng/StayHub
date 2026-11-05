import { createSearchPage } from '../../src/domain/search-result';
const item = { accommodationId: '00000000-0000-4000-8000-000000000001', name: 'Casa', location: 'Bogotá, CO', minNightlyPrice: 100, currency: 'COP', capacity: 2, amenities: ['wifi'], primaryPhotoUrl: null, relevance: 0.8 } as const;
describe('SearchResult', () => {
  it('computes stable pagination metadata without exposing detail fields', () => {
    const page = createSearchPage([item], 1, 1, 2, false);
    expect(page).toEqual({ items: [item], page: 1, pageSize: 1, total: 2, hasNext: true, availabilityKind: null });
    expect(page.items[0]).not.toHaveProperty('description');
  });
  it('marks date-filtered availability as projected', () => { expect(createSearchPage([item], 1, 20, 1, true).availabilityKind).toBe('PROJECTED'); });
});
