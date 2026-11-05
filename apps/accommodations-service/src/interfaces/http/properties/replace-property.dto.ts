import type { ReplacePropertyCommand } from '@accommodations/application/properties/replace-property.use-case';
import { parseLocation } from '@accommodations/domain/properties/location';
import { parseDescription, parseFeatureCodes, parseName, parsePropertyStatus, parsePropertyType, parseVersion } from '@accommodations/domain/properties/property.policy';
import { parseRooms } from '@accommodations/domain/rooms/room.policy';
import { closedObject } from '@accommodations/domain/shared/input';

const REPLACE_FIELDS = ['type', 'name', 'description', 'location', 'featureCodes', 'status', 'version', 'rooms'];

/** Closed PropertyReplace body: omitting description or a room basePrice clears them. */
export function parseReplaceProperty(body: unknown): ReplacePropertyCommand {
  const input = closedObject(body, 'body', REPLACE_FIELDS);
  return {
    type: parsePropertyType(input.type), name: parseName(input.name), description: parseDescription(input.description),
    location: parseLocation(input.location), featureCodes: parseFeatureCodes(input.featureCodes),
    status: parsePropertyStatus(input.status), version: parseVersion(input.version), rooms: parseRooms(input.rooms, true),
  };
}
