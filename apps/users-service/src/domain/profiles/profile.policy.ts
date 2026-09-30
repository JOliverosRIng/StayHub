import type { ProfilePatch, Preferences } from './profile.types';
import { invalid } from '../shared/domain-error';
import { Name, Email } from '../users/values';
export function parseProfilePatch(body: unknown, hasPhoto = false): ProfilePatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('profile');
  const input = body as Record<string, unknown>;
  const allowed = ['expectedVersion', 'name', 'email', 'phone', 'preferences', 'photo'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return invalid('profile');
  if (!Number.isInteger(input.expectedVersion) || Number(input.expectedVersion) < 1 || Number(input.expectedVersion) > 2_147_483_646) return invalid('expectedVersion');
  if (!hasPhoto && Object.keys(input).length === 1) return invalid('profile');
  const patch: ProfilePatch = { expectedVersion: input.expectedVersion as number };
  if ('name' in input) patch.name = Name.parse(input.name);
  if ('email' in input) patch.email = Email.parse(input.email).value;
  if ('phone' in input) {
    if (input.phone !== null && (typeof input.phone !== 'string' || !/^\+[1-9][0-9]{7,14}$/.test(input.phone))) return invalid('phone');
    patch.phone = input.phone;
  }
  if ('preferences' in input) {
    const preferences = input.preferences;
    if (preferences === null) patch.preferences = null;
    else {
      if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences) || Object.keys(preferences).length > 20 || Object.values(preferences).some((value: unknown) => !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))) return invalid('preferences');
      patch.preferences = { ...preferences } as Preferences;
    }
  }
  if ('photo' in input) { if (input.photo !== null || hasPhoto) return invalid('photo'); patch.photo = null; }
  return patch;
}
