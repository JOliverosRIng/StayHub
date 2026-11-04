import { randomUUID } from 'node:crypto';
import type { NewProperty } from '../../src/application/ports/property.repository';

export const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001', 'hex');
export const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
export const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);

export const location = { addressLine: 'Calle 1 # 2-3', city: 'Bogotá', region: 'Cundinamarca', country: 'CO', postalCode: '110111', latitude: 4.711, longitude: -74.0721 };

export interface CreateBody {
  type: string; name: string; description?: string; location: Record<string, unknown>; featureCodes?: string[];
  rooms: Record<string, unknown>[];
}

export function createBody(overrides: Partial<CreateBody> = {}): CreateBody {
  return {
    type: 'APARTMENT', name: 'Apartamento sintético', description: 'Vista a la montaña', location: { ...location },
    featureCodes: ['WIFI', 'KITCHEN'],
    rooms: [{ name: 'Principal', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } }],
    ...overrides,
  };
}

export interface ReplaceBody extends CreateBody { status: string; version: number }

export function replaceBody(overrides: Partial<ReplaceBody> = {}): ReplaceBody {
  return { ...createBody(), status: 'DRAFT', version: 1, ...overrides };
}

/** Builds a PUT body from a persisted Property view, omitting null description so the closed DTO clears it. */
export function replaceFrom(property: {
  type: string; name: string; description: string | null; location: Record<string, unknown>; status: string; version: number;
  features: { code: string }[]; rooms: { id: string; name: string; capacity: number; basePrice: { amount: string; currency: string } | null }[];
}, overrides: Partial<ReplaceBody> = {}): ReplaceBody {
  const body: ReplaceBody = {
    type: property.type, name: property.name, location: property.location, featureCodes: property.features.map((feature) => feature.code),
    status: property.status, version: property.version,
    rooms: property.rooms.map(({ id, name, capacity, basePrice }) => ({ id, name, capacity, ...(basePrice ? { basePrice } : {}) })),
  };
  if (property.description !== null) body.description = property.description;
  return { ...body, ...overrides };
}

export function newProperty(ownerId: string = randomUUID(), overrides: Partial<NewProperty> = {}): NewProperty {
  return {
    id: randomUUID(), ownerId, type: 'APARTMENT', name: 'Apartamento sintético', description: 'Vista a la montaña',
    location: { ...location }, featureCodes: ['WIFI', 'KITCHEN'],
    rooms: [
      { id: randomUUID(), name: 'Principal', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } },
      { id: randomUUID(), name: 'Auxiliar', capacity: 1, basePrice: null },
    ],
    ...overrides,
  };
}
