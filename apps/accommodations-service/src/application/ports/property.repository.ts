import type { Location, Photo, PhotoMediaType, Property, PropertyType, ReplacementPlan, Room } from '@accommodations/domain/properties/property.types';

export const PROPERTY_REPOSITORY = Symbol('PROPERTY_REPOSITORY');

export interface NewProperty {
  id: string; ownerId: string; type: PropertyType; name: string; description: string | null; location: Location;
  featureCodes: string[]; rooms: Room[];
}
export interface NewPhoto { id: string; storageKey: string; mediaType: PhotoMediaType; byteSize: number; position: number }

/**
 * Persistence port for the Property aggregate. `replace` and `addPhoto` lock the aggregate, pass the current
 * state to `decide` and persist its result in the same transaction; a thrown error rolls everything back.
 * Unknown feature codes fail with VALIDATION_ERROR on `featureCodes`. A missing property yields null.
 */
export interface PropertyRepository {
  create(property: NewProperty): Promise<Property>;
  findById(id: string): Promise<Property | null>;
  replace(id: string, decide: (current: Property) => ReplacementPlan): Promise<Property | null>;
  addPhoto(id: string, decide: (current: Property) => Promise<NewPhoto>): Promise<Photo | null>;
}
