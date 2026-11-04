import { createSearchQuery, type SearchQuery } from '../../src/domain/search-query';
import { createSuggestionQuery, type SuggestionQuery } from '../../src/domain/suggestion';

export const SEARCH_PERFORMANCE_PROFILE = Object.freeze({
  version: 'search-performance-v1',
  datasetSize: 5_000,
  warmupRequests: 12,
  measuredRequests: 80,
  concurrency: 8,
  resources: Object.freeze({ cpu: '2 vCPU', memory: '1 GiB', postgres: 'PostgreSQL 16 + PostGIS', redis: 'Redis 7' }),
  gates: Object.freeze({ p95Ms: 500, unexpectedErrorRate: 0.01 }),
});

export const performanceSearchMix: readonly SearchQuery[] = Object.freeze([
  createSearchQuery({ q: 'casa piscina', pageSize: 20 }),
  createSearchQuery({ location: 'Bogotá', minPrice: 100_000, maxPrice: 350_000, currency: 'COP', guests: 3, amenities: ['wifi'], pageSize: 20 }),
  createSearchQuery({ location: 'Medellín', checkIn: '2026-12-10', checkOut: '2026-12-14', guests: 2, amenities: ['wifi', 'piscina'], pageSize: 20 }),
  createSearchQuery({ q: 'apartamento centro', location: 'Cartagena', pageSize: 20 }),
]);

export const performanceSuggestionMix: readonly SuggestionQuery[] = Object.freeze([
  createSuggestionQuery({ q: 'bogot', limit: 10 }),
  createSuggestionQuery({ q: 'casa', limit: 10 }),
  createSuggestionQuery({ q: 'medell', limit: 10 }),
  createSuggestionQuery({ q: 'apart', limit: 10 }),
]);

export const seedPerformanceDatasetSql = `
TRUNCATE availability_windows, search_documents CASCADE;
INSERT INTO search_documents (
  "accommodationId", "projectionVersion", "published", "name", "description", "countryCode", "region", "city",
  "minNightlyPrice", "currency", "capacity", "amenities", "keywords", "sourceUpdatedAt"
)
SELECT md5('stayhub-search-performance-' || g)::uuid, 1, g % 10 <> 0,
  CASE WHEN g % 2 = 0 THEN 'Casa piscina ' ELSE 'Apartamento centro ' END || g,
  'Alojamiento representativo para pruebas de rendimiento', 'CO',
  CASE g % 4 WHEN 0 THEN 'Cundinamarca' WHEN 1 THEN 'Antioquia' WHEN 2 THEN 'Bolívar' ELSE 'Valle del Cauca' END,
  CASE g % 4 WHEN 0 THEN 'Bogotá' WHEN 1 THEN 'Medellín' WHEN 2 THEN 'Cartagena' ELSE 'Cali' END,
  80000 + (g % 30) * 15000, 'COP', 1 + (g % 8),
  CASE WHEN g % 3 = 0 THEN ARRAY['wifi','piscina'] ELSE ARRAY['wifi'] END,
  CASE WHEN g % 2 = 0 THEN ARRAY['casa','piscina'] ELSE ARRAY['apartamento','centro'] END,
  NOW()
FROM generate_series(1, ${SEARCH_PERFORMANCE_PROFILE.datasetSize}) AS g;
INSERT INTO availability_windows ("id", "accommodationId", "startDate", "endDate", "availableCapacity", "projectionVersion")
SELECT md5('stayhub-search-performance-window-' || g)::uuid, md5('stayhub-search-performance-' || g)::uuid,
  DATE '2026-12-01', DATE '2026-12-31', 1 + (g % 8), 1
FROM generate_series(1, ${SEARCH_PERFORMANCE_PROFILE.datasetSize}) AS g;
ANALYZE search_documents;
ANALYZE availability_windows;
`;
