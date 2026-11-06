import { invalid } from './domain-error';
export type Input = Record<string, unknown>;
export function closedObject(value: unknown, field: string, allowed: readonly string[]): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(field);
  if (Object.keys(value).some((key) => !allowed.includes(key))) return invalid(field);
  return value as Input;
}
export function boundedString(value: unknown, field: string, max: number, min = 0): string {
  if (typeof value !== 'string') return invalid(field);
  const length = [...value].length;
  if (length < min || length > max) return invalid(field);
  return value;
}
