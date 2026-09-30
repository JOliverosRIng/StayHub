import { invalid } from '../shared/domain-error';
export type UserRole = 'GUEST' | 'OWNER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const Email = { parse(input: unknown): { value: string; normalized: string } {
  if (typeof input !== 'string') return invalid('email');
  const value = input.trim();
  if (value.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value)) return invalid('email');
  const local = value.split('@')[0]!;
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return invalid('email');
  return { value, normalized: value.toLowerCase() };
} };
export const Name = { parse(value: unknown): string {
  if (typeof value !== 'string' || [...value.trim()].length < 2 || [...value.trim()].length > 100) return invalid('name');
  return value.trim();
} };
export const UserId = { parse(value: unknown): string { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return invalid('userId'); return value; } };
export const RegistrationId = { parse(value: unknown): string { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return invalid('registrationId'); return value; } };
export const Role = {
  parse(value: unknown): UserRole { if (value !== 'GUEST' && value !== 'OWNER' && value !== 'ADMIN') return invalid('role'); return value; },
  public(value: unknown): 'GUEST' | 'OWNER' { if (value !== 'GUEST' && value !== 'OWNER') return invalid('role'); return value; },
};
export const RegistrationStatus = { parse(value: unknown): UserStatus { if (value !== 'PENDING' && value !== 'ACTIVE' && value !== 'CANCELLED') return invalid('status'); return value; } };
