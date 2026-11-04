import { invalid } from '../shared/domain-error';
import { boundedString, closedObject } from '../shared/input';
import { parseUuid } from '../shared/uuid';
import type { BasePrice, RoomData } from '../properties/property.types';

export const MAX_ROOM_NAME_LENGTH = 120;
const MAX_INT = 2_147_483_647;
const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const ZERO_PATTERN = /^0+(\.0{1,2})?$/;

export type RoomInput = RoomData & { id?: string };

export function parseBasePrice(value: unknown, field: string): BasePrice {
  const input = closedObject(value, field, ['amount', 'currency']);
  const { amount, currency } = input;
  if (typeof amount !== 'string' || !AMOUNT_PATTERN.test(amount) || ZERO_PATTERN.test(amount)) return invalid(`${field}.amount`);
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return invalid(`${field}.currency`);
  return { amount, currency };
}

function parseRoom(value: unknown, index: number, allowId: boolean): RoomInput {
  const field = `rooms[${index}]`;
  const input = closedObject(value, field, allowId ? ['id', 'name', 'capacity', 'basePrice'] : ['name', 'capacity', 'basePrice']);
  const room: RoomInput = {
    name: boundedString(input.name, `${field}.name`, MAX_ROOM_NAME_LENGTH),
    capacity: typeof input.capacity === 'number' && Number.isInteger(input.capacity) && input.capacity >= 1 && input.capacity <= MAX_INT ? input.capacity : invalid(`${field}.capacity`),
    basePrice: 'basePrice' in input ? parseBasePrice(input.basePrice, `${field}.basePrice`) : null,
  };
  if (allowId && 'id' in input) return { id: parseUuid(input.id, `${field}.id`), ...room };
  return room;
}

/** Parses the complete room collection; a property always keeps one or more rooms. */
export function parseRooms(value: unknown, allowId: boolean): RoomInput[] {
  if (!Array.isArray(value) || value.length === 0) return invalid('rooms');
  return value.map((room, index) => parseRoom(room, index, allowId));
}
