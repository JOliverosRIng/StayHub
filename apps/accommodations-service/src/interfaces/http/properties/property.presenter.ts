import type { BasePrice, Feature, Location, Photo, Principal, Property, PropertyStatus, PropertyType } from '@accommodations/domain/properties/property.types';
import { isOwner } from '@accommodations/domain/properties/visibility.policy';

export interface PhotoView { id: string; mediaType: Photo['mediaType']; byteSize: number; position: number; createdAt: string }
export interface PropertyView {
  id: string; ownerId?: string; type: PropertyType; name: string; description: string | null; location: Location; status: PropertyStatus;
  version: number; rooms: { id: string; name: string; capacity: number; basePrice: BasePrice | null }[]; features: Feature[];
  photos: PhotoView[]; createdAt: string; updatedAt: string;
}

/** Photo metadata only: storage keys and filesystem paths never leave the service. */
export function presentPhoto(photo: Photo): PhotoView {
  return { id: photo.id, mediaType: photo.mediaType, byteSize: photo.byteSize, position: photo.position, createdAt: photo.createdAt.toISOString() };
}

/** ownerId is disclosed only to the authenticated OWNER who owns the property. */
export function presentProperty(property: Property, viewer: Principal | undefined): PropertyView {
  return {
    id: property.id, ...(isOwner(property, viewer) ? { ownerId: property.ownerId } : {}),
    type: property.type, name: property.name, description: property.description, location: property.location, status: property.status,
    version: property.version,
    rooms: property.rooms.map(({ id, name, capacity, basePrice }) => ({ id, name, capacity, basePrice })),
    features: property.features.map(({ code, name }) => ({ code, name })),
    photos: property.photos.map(presentPhoto),
    createdAt: property.createdAt.toISOString(), updatedAt: property.updatedAt.toISOString(),
  };
}
