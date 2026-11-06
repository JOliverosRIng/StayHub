import { DomainError } from '../shared/domain-error';
import type { Location, PropertyStatus, RoomData } from './property.types';

const ALLOWED_TRANSITIONS: readonly (readonly [PropertyStatus, PropertyStatus])[] = [
  ['DRAFT', 'PUBLISHED'], ['PUBLISHED', 'UNPUBLISHED'], ['UNPUBLISHED', 'PUBLISHED'],
];

export function assertTransition(from: PropertyStatus, to: PropertyStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS.some(([a, b]) => a === from && b === to)) throw new DomainError('STATE_CONFLICT');
}

export interface PublicationSnapshot { name: string; location: Location; rooms: readonly RoomData[]; photoCount: number }

export function isPublishable(snapshot: PublicationSnapshot): boolean {
  const { name, location } = snapshot;
  return name.trim().length > 0
    && [location.addressLine, location.city, location.region, location.country].every((part) => part.trim().length > 0)
    && snapshot.rooms.some((room) => room.basePrice !== null)
    && snapshot.photoCount > 0;
}

export function assertPublishable(snapshot: PublicationSnapshot): void {
  if (!isPublishable(snapshot)) throw new DomainError('PUBLICATION_INCOMPLETE');
}
