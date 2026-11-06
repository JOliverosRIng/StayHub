export const upsertedProjectionEventFixture = {
  eventId: '10000000-0000-4000-8000-000000000001', eventType: 'accommodation.search.v1.upserted', schemaVersion: 1,
  occurredAt: '2026-11-01T00:00:00Z', accommodationId: '00000000-0000-4000-8000-000000000001', projectionVersion: 1,
  data: { published: true, name: 'Casa Bogotá', description: 'Alojamiento contractual', countryCode: 'CO', region: 'Cundinamarca', city: 'Bogotá', addressSummary: null, latitude: null, longitude: null, minNightlyPrice: 250000, currency: 'COP', capacity: 4, amenities: ['wifi', 'piscina'], keywords: ['hotel'], primaryPhotoUrl: null, availability: [{ startDate: '2026-12-01', endDate: '2026-12-31', availableCapacity: 4 }], sourceUpdatedAt: '2026-11-01T00:00:00Z' },
} as const;

export const removedProjectionEventFixture = {
  eventId: '10000000-0000-4000-8000-000000000002',
  eventType: 'accommodation.search.v1.removed',
  schemaVersion: 1,
  occurredAt: '2026-11-02T00:00:00Z',
  accommodationId: '00000000-0000-4000-8000-000000000001',
  projectionVersion: 2,
} as const;
