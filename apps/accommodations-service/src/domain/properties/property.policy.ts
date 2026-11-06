import { invalid } from '../shared/domain-error';
import { boundedString } from '../shared/input';
import { PROPERTY_STATUSES, PROPERTY_TYPES, type PropertyStatus, type PropertyType } from './property.types';

export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_FEATURE_CODES = 50;
const MAX_INT = 2_147_483_647;

export function parsePropertyType(value: unknown): PropertyType {
  if (!PROPERTY_TYPES.includes(value as PropertyType)) return invalid('type');
  return value as PropertyType;
}
export function parsePropertyStatus(value: unknown): PropertyStatus {
  if (!PROPERTY_STATUSES.includes(value as PropertyStatus)) return invalid('status');
  return value as PropertyStatus;
}
export function parseName(value: unknown): string { return boundedString(value, 'name', MAX_NAME_LENGTH, 1); }
export function parseDescription(value: unknown): string | null {
  return value === undefined ? null : boundedString(value, 'description', MAX_DESCRIPTION_LENGTH);
}
export function parseVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_INT) return invalid('version');
  return value;
}
export function parseFeatureCodes(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_FEATURE_CODES || value.some((code) => typeof code !== 'string')) return invalid('featureCodes');
  const codes = value as string[];
  if (new Set(codes).size !== codes.length) return invalid('featureCodes');
  return [...codes];
}
