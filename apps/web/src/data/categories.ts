import type { Category } from '../types';
import { FEATURE_CATALOG } from '../types/catalog';

export const CATEGORIES: Category[] = [
  { label: 'Todo', icon: '🗺️' },
  { label: 'Playa', icon: '🏖️' },
  { label: 'Montaña', icon: '⛰️' },
  { label: 'Ciudad', icon: '🌆' },
  { label: 'Cabaña', icon: '🏕️' },
  { label: 'Lujo', icon: '✨' },
  { label: 'Piscina', icon: '🏊' },
  { label: 'Pet-friendly', icon: '🐾' },
];

const AMENITY_ICONS: Record<string, string> = {
  WIFI: '📶', PARKING: '🅿️', POOL: '🏊', AIR_CONDITIONING: '❄️', KITCHEN: '🍳', PETS_ALLOWED: '🐾', BREAKFAST_INCLUDED: '🥐',
};

/** Search shortcuts: each pill filters by one amenity of the accommodations feature catalog. */
export interface AmenityCategory extends Category { amenity?: string }

export const ALL_CATEGORY = 'Todo';

export const AMENITY_CATEGORIES: AmenityCategory[] = [
  { label: ALL_CATEGORY, icon: '🗺️' },
  ...FEATURE_CATALOG.map((f) => ({ label: f.name, icon: AMENITY_ICONS[f.code] ?? '•', amenity: f.code.toLowerCase() })),
];
