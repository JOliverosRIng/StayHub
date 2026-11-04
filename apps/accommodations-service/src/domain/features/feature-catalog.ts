import type { Feature } from '../properties/property.types';
/** v1 catalog, installed by migration 202611040002_seed_feature_catalog and prisma/seed.ts. */
export const FEATURE_CATALOG: readonly Feature[] = [
  { code: 'WIFI', name: 'Wi-Fi' },
  { code: 'PARKING', name: 'Parking' },
  { code: 'POOL', name: 'Pool' },
  { code: 'AIR_CONDITIONING', name: 'Air conditioning' },
  { code: 'KITCHEN', name: 'Kitchen' },
  { code: 'PETS_ALLOWED', name: 'Pets allowed' },
  { code: 'BREAKFAST_INCLUDED', name: 'Breakfast included' },
];
