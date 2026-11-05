export const PROPERTY_TYPES = ['HOTEL', 'APARTMENT', 'HOUSE', 'OTHER'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_STATUSES = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp';
export type Role = 'GUEST' | 'OWNER' | 'ADMIN';

export interface Principal { sub: string; role: Role }

export interface Location {
  addressLine: string; city: string; region: string; country: string;
  postalCode?: string; latitude?: number; longitude?: number;
}
export interface BasePrice { amount: string; currency: string }
export interface RoomData { name: string; capacity: number; basePrice: BasePrice | null }
export interface Room extends RoomData { id: string }
export interface Feature { code: string; name: string }
export interface Photo { id: string; storageKey: string; mediaType: PhotoMediaType; byteSize: number; position: number; createdAt: Date }

export interface Property {
  id: string; ownerId: string; type: PropertyType; name: string; description: string | null; location: Location;
  status: PropertyStatus; version: number; rooms: Room[]; features: Feature[]; photos: Photo[]; createdAt: Date; updatedAt: Date;
}

/** Full editable representation to persist; a room without id is created, omitted current rooms are deleted. */
export interface ReplacementPlan {
  type: PropertyType; name: string; description: string | null; location: Location; status: PropertyStatus;
  featureCodes: string[]; rooms: (RoomData & { id?: string })[];
}
