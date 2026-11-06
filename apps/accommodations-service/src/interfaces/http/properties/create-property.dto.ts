import type { CreatePropertyCommand } from '@accommodations/application/properties/create-property.use-case';
import { parseLocation } from '@accommodations/domain/properties/location';
import { parseDescription, parseFeatureCodes, parseName, parsePropertyType } from '@accommodations/domain/properties/property.policy';
import { parseRooms } from '@accommodations/domain/rooms/room.policy';
import { closedObject } from '@accommodations/domain/shared/input';

const CREATE_FIELDS = ['type', 'name', 'description', 'location', 'featureCodes', 'rooms'];

/** Closed PropertyCreate body: ownerId, status, version and ids are never accepted from the client. */
export function parseCreateProperty(body: unknown): CreatePropertyCommand {
  const input = closedObject(body, 'body', CREATE_FIELDS);
  return {
    type: parsePropertyType(input.type), name: parseName(input.name), description: parseDescription(input.description),
    location: parseLocation(input.location), featureCodes: parseFeatureCodes(input.featureCodes),
    rooms: parseRooms(input.rooms, false).map(({ name, capacity, basePrice }) => ({ name, capacity, basePrice })),
  };
}
