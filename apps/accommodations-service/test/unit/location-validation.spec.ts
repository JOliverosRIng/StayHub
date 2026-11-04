import { DomainError } from '../../src/domain/shared/domain-error';
import { columnsToLocation, locationToColumns, parseLocation } from '../../src/domain/properties/location';

function fieldOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError && error.code === 'VALIDATION_ERROR') return error.errors[0]?.field; throw error; }
  return undefined;
}
const location = { addressLine: 'Calle 1 # 2-3', city: 'Bogotá', region: 'Cundinamarca', country: 'CO', postalCode: '110111', latitude: 4.711, longitude: -74.0721 };

describe('ACC-009 location validation', () => {
  it('accepts the complete schema and the minimum required fields', () => {
    expect(parseLocation(location)).toEqual(location);
    expect(parseLocation({ addressLine: 'A', city: 'B', region: 'C', country: 'AR' })).toEqual({ addressLine: 'A', city: 'B', region: 'C', country: 'AR' });
  });
  it.each(['addressLine', 'city', 'region', 'country'])('requires %s', (key) => {
    const input: Record<string, unknown> = { ...location }; delete input[key];
    expect(fieldOf(() => parseLocation(input))).toBe(`location.${key}`);
  });
  it.each([
    ['addressLine', 'a'.repeat(201)], ['city', 'c'.repeat(101)], ['region', 'r'.repeat(101)], ['postalCode', 'p'.repeat(21)],
    ['country', 'co'], ['country', 'COL'], ['country', 'C1'], ['postalCode', null], ['city', 5],
    ['latitude', 90.0001], ['latitude', -91], ['latitude', '4.7'], ['latitude', Number.NaN], ['latitude', null],
    ['longitude', 180.5], ['longitude', -181], ['longitude', Number.POSITIVE_INFINITY],
  ])('rejects %s=%p', (key, value) => { expect(fieldOf(() => parseLocation({ ...location, [key]: value }))).toBe(`location.${key}`); });
  it('accepts coordinate bounds', () => {
    expect(parseLocation({ ...location, latitude: -90, longitude: 180 })).toMatchObject({ latitude: -90, longitude: 180 });
  });
  it('rejects unknown keys and non-object locations', () => {
    expect(fieldOf(() => parseLocation({ ...location, street: 'x' }))).toBe('location');
    for (const value of [null, [], 'Bogotá', undefined]) expect(fieldOf(() => parseLocation(value))).toBe('location');
  });
});

describe('ACC-009 location mapping', () => {
  it('maps a location to nullable persistence columns and back without inventing fields', () => {
    const minimal = { addressLine: 'A', city: 'B', region: 'C', country: 'AR' };
    expect(locationToColumns(minimal)).toEqual({ ...minimal, postalCode: null, latitude: null, longitude: null });
    expect(columnsToLocation({ ...minimal, postalCode: null, latitude: null, longitude: null })).toEqual(minimal);
    expect(columnsToLocation(locationToColumns(location))).toEqual(location);
  });
});
