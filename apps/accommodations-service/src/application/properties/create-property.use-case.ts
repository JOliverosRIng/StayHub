import { randomUUID } from 'node:crypto';
import type { PropertyRepository } from '../ports/property.repository';
import type { Location, Principal, Property, PropertyType, RoomData } from '@accommodations/domain/properties/property.types';

export interface CreatePropertyCommand {
  type: PropertyType; name: string; description: string | null; location: Location; featureCodes: string[]; rooms: RoomData[];
}

/** Creates a DRAFT property owned by the authenticated subject; identifiers are always server-assigned. */
export class CreatePropertyUseCase {
  constructor(private readonly properties: PropertyRepository) {}
  execute(principal: Principal, command: CreatePropertyCommand): Promise<Property> {
    return this.properties.create({
      id: randomUUID(), ownerId: principal.sub, type: command.type, name: command.name, description: command.description,
      location: command.location, featureCodes: command.featureCodes, rooms: command.rooms.map((room) => ({ id: randomUUID(), ...room })),
    });
  }
}
