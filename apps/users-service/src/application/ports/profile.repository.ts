import type { Role } from './user.repository';
import type { Preferences, ProfilePatch } from '@users/domain/profiles/profile.types';
export type { Preferences, ProfilePatch } from '@users/domain/profiles/profile.types';
export interface Profile { id: string; name: string; email: string; role: Role; phone: string | null; preferences: Preferences | null; photoUrl: string | null; version: number }
export interface Photo { content: Uint8Array; mediaType: 'image/jpeg' | 'image/png'; byteSize: number; sha256: string }
export interface ProfileRepository {
  find(id: string): Promise<Profile | null>;
  photo(id: string): Promise<Photo | null>;
  update(id: string, patch: ProfilePatch, photo?: Photo): Promise<Profile>;
}
export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');
