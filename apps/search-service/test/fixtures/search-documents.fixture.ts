import type { SearchDocument } from '../../src/domain/projection';
const base = { projectionVersion: 1n, published: true, description: 'Alojamiento contractual', countryCode: 'CO', region: 'Cundinamarca', addressSummary: null, location: null, currency: 'COP', keywords: ['hotel'], primaryPhotoUrl: null, sourceUpdatedAt: new Date('2026-11-01T00:00:00Z'), indexedAt: new Date('2026-11-01T00:00:00Z') } as const;
export const searchDocumentsFixture: readonly SearchDocument[] = [
  { ...base, accommodationId: '00000000-0000-4000-8000-000000000001', name: 'Casa Bogotá', city: 'Bogotá', minNightlyPrice: 250000, capacity: 4, amenities: ['wifi', 'piscina'] },
  { ...base, accommodationId: '00000000-0000-4000-8000-000000000002', name: 'Loft Medellín', city: 'Medellín', region: 'Antioquia', minNightlyPrice: 180000, capacity: 2, amenities: ['wifi'] },
  { ...base, accommodationId: '00000000-0000-4000-8000-000000000003', name: 'Oculta', city: 'Bogotá', published: false, minNightlyPrice: 100000, capacity: 6, amenities: ['wifi', 'piscina'] },
];
