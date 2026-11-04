import type { PropertyRepository } from '../ports/property.repository';
import type { Location, Principal, Property, PropertyStatus, PropertyType, ReplacementPlan } from '@accommodations/domain/properties/property.types';
import { assertPublishable, assertTransition } from '@accommodations/domain/properties/publication.policy';
import { isOwner } from '@accommodations/domain/properties/visibility.policy';
import type { RoomInput } from '@accommodations/domain/rooms/room.policy';
import { DomainError, invalid } from '@accommodations/domain/shared/domain-error';

export interface ReplacePropertyCommand {
  type: PropertyType; name: string; description: string | null; location: Location; featureCodes: string[];
  status: PropertyStatus; version: number; rooms: RoomInput[];
}

/** 404 ownership → VERSION_CONFLICT → rooms[i].id → STATE_CONFLICT → PUBLICATION_INCOMPLETE. */
export function planReplacement(current: Property, principal: Principal, command: ReplacePropertyCommand): ReplacementPlan {
  if (!isOwner(current, principal)) throw new DomainError('NOT_FOUND');
  if (command.version !== current.version) throw new DomainError('VERSION_CONFLICT');
  command.rooms.forEach((room, index) => {
    if (room.id && !current.rooms.some((existing) => existing.id === room.id)) invalid(`rooms[${index}].id`);
  });
  assertTransition(current.status, command.status);
  if (command.status === 'PUBLISHED') {
    assertPublishable({ name: command.name, location: command.location, rooms: command.rooms, photoCount: current.photos.length });
  }
  return {
    type: command.type, name: command.name, description: command.description, location: command.location,
    status: command.status, featureCodes: command.featureCodes, rooms: command.rooms,
  };
}

export class ReplacePropertyUseCase {
  constructor(private readonly properties: PropertyRepository) {}
  async execute(id: string, principal: Principal, command: ReplacePropertyCommand): Promise<Property> {
    const property = await this.properties.replace(id, (current) => planReplacement(current, principal, command));
    if (!property) throw new DomainError('NOT_FOUND');
    return property;
  }
}
