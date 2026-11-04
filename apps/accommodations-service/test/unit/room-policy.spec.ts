import { randomUUID } from 'node:crypto';
import { DomainError } from '../../src/domain/shared/domain-error';
import { parseBasePrice, parseRooms } from '../../src/domain/rooms/room.policy';

function fieldOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError && error.code === 'VALIDATION_ERROR') return error.errors[0]?.field; throw error; }
  return undefined;
}
const room = { name: 'Principal', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } };

describe('ACC-009 room cardinality and capacity', () => {
  it('parses one or more rooms preserving order and maps an omitted basePrice to null', () => {
    expect(parseRooms([room, { name: 'Suite', capacity: 4 }], false)).toEqual([
      { name: 'Principal', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } },
      { name: 'Suite', capacity: 4, basePrice: null },
    ]);
  });
  it.each([[[]], [null], [{}], ['rooms'], [undefined]])('requires a non-empty rooms array: %p', (rooms) => { expect(fieldOf(() => parseRooms(rooms, false))).toBe('rooms'); });
  it.each([0, -1, 1.5, '2', null, 2_147_483_648])('rejects capacity %p', (capacity) => {
    expect(fieldOf(() => parseRooms([room, { ...room, capacity }], false))).toBe('rooms[1].capacity');
  });
  it('accepts the maximum 32-bit capacity', () => { expect(parseRooms([{ ...room, capacity: 2_147_483_647 }], false)[0]?.capacity).toBe(2_147_483_647); });
  it.each([['x'.repeat(121)], [null], [3], [undefined]])('rejects room name %p', (name) => { expect(fieldOf(() => parseRooms([{ ...room, name }], false))).toBe('rooms[0].name'); });
  it('rejects unknown room fields and non-object rooms', () => {
    expect(fieldOf(() => parseRooms([{ ...room, beds: 2 }], false))).toBe('rooms[0]');
    expect(fieldOf(() => parseRooms(['room'], false))).toBe('rooms[0]');
  });
  it('accepts room ids only in replacement payloads and validates their format', () => {
    const id = randomUUID();
    expect(fieldOf(() => parseRooms([{ ...room, id }], false))).toBe('rooms[0]');
    expect(parseRooms([{ ...room, id: id.toUpperCase() }], true)[0]).toMatchObject({ id });
    expect(fieldOf(() => parseRooms([room, { ...room, id: 'not-a-uuid' }], true))).toBe('rooms[1].id');
  });
});

describe('ACC-009 base price amount and currency', () => {
  it.each(['1', '0.01', '0.5', '120000', '120000.5', '9999999999.99', '0001'])('accepts positive decimal string %s', (amount) => {
    expect(parseBasePrice({ amount, currency: 'USD' }, 'rooms[0].basePrice')).toEqual({ amount, currency: 'USD' });
  });
  it.each(['0', '0.0', '0.00', '00', '-1', '1.234', '12345678901', '1e3', ' 1', '1,5', '', '.5', '5.'])('rejects amount %p', (amount) => {
    expect(fieldOf(() => parseBasePrice({ amount, currency: 'USD' }, 'rooms[0].basePrice'))).toBe('rooms[0].basePrice.amount');
  });
  it('requires the amount to be transported as a string', () => {
    expect(fieldOf(() => parseBasePrice({ amount: 10, currency: 'USD' }, 'rooms[0].basePrice'))).toBe('rooms[0].basePrice.amount');
  });
  it.each(['usd', 'US', 'USDD', '', 1, undefined])('rejects currency %p', (currency) => {
    expect(fieldOf(() => parseBasePrice({ amount: '10', currency }, 'rooms[0].basePrice'))).toBe('rooms[0].basePrice.currency');
  });
  it('rejects unknown, null or non-object base prices', () => {
    expect(fieldOf(() => parseBasePrice({ amount: '10', currency: 'USD', season: 'high' }, 'rooms[0].basePrice'))).toBe('rooms[0].basePrice');
    expect(fieldOf(() => parseBasePrice(null, 'rooms[0].basePrice'))).toBe('rooms[0].basePrice');
    expect(fieldOf(() => parseBasePrice('10 USD', 'rooms[0].basePrice'))).toBe('rooms[0].basePrice');
  });
});
