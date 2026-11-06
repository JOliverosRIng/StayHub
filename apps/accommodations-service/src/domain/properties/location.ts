import { invalid } from '../shared/domain-error';
import { boundedString, closedObject } from '../shared/input';
import type { Location } from './property.types';

export interface LocationColumns {
  addressLine: string; city: string; region: string; country: string;
  postalCode: string | null; latitude: number | null; longitude: number | null;
}

function coordinate(value: unknown, field: string, limit: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -limit || value > limit) return invalid(field);
  return value;
}

export function parseLocation(value: unknown): Location {
  const input = closedObject(value, 'location', ['addressLine', 'city', 'region', 'country', 'postalCode', 'latitude', 'longitude']);
  const location: Location = {
    addressLine: boundedString(input.addressLine, 'location.addressLine', 200),
    city: boundedString(input.city, 'location.city', 100),
    region: boundedString(input.region, 'location.region', 100),
    country: typeof input.country === 'string' && /^[A-Z]{2}$/.test(input.country) ? input.country : invalid('location.country'),
  };
  if ('postalCode' in input) location.postalCode = boundedString(input.postalCode, 'location.postalCode', 20);
  if ('latitude' in input) location.latitude = coordinate(input.latitude, 'location.latitude', 90);
  if ('longitude' in input) location.longitude = coordinate(input.longitude, 'location.longitude', 180);
  return location;
}

export function locationToColumns(location: Location): LocationColumns {
  return {
    addressLine: location.addressLine, city: location.city, region: location.region, country: location.country,
    postalCode: location.postalCode ?? null, latitude: location.latitude ?? null, longitude: location.longitude ?? null,
  };
}

export function columnsToLocation(columns: LocationColumns): Location {
  const location: Location = { addressLine: columns.addressLine, city: columns.city, region: columns.region, country: columns.country };
  if (columns.postalCode !== null) location.postalCode = columns.postalCode;
  if (columns.latitude !== null) location.latitude = columns.latitude;
  if (columns.longitude !== null) location.longitude = columns.longitude;
  return location;
}
