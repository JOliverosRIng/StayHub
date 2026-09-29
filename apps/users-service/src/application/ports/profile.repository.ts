import type { Preferences, UserRole } from './user.repository';

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');

export type PhotoMediaType = 'image/jpeg' | 'image/png';

export interface ProfilePhotoMetadata {
  readonly mediaType: PhotoMediaType;
  readonly byteSize: number;
  readonly sha256: string;
  readonly updatedAt: Date;
}

export interface ProfilePhotoContent {
  readonly mediaType: PhotoMediaType;
  readonly content: Uint8Array;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface StoredProfilePhoto extends ProfilePhotoContent {
  readonly updatedAt: Date;
}

export interface ProfileSnapshot {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly phone: string | null;
  readonly preferences: Preferences | null;
  readonly version: number;
  readonly photo: ProfilePhotoMetadata | null;
}

export type PhotoChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'replace'; readonly photo: ProfilePhotoContent }
  | { readonly kind: 'remove' };

/** Omitted properties keep their stored value; `null` clears optional fields. */
export interface ProfileChanges {
  readonly name?: string;
  readonly email?: { readonly value: string; readonly normalized: string };
  readonly phone?: string | null;
  readonly preferences?: Preferences | null;
  readonly photo: PhotoChange;
}

export type ProfileUpdateResult =
  | { readonly outcome: 'updated'; readonly profile: ProfileSnapshot }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'version-conflict' }
  | { readonly outcome: 'email-conflict' };

export interface ProfileRepository {
  findActiveProfile(userId: string): Promise<ProfileSnapshot | null>;

  findActivePhoto(userId: string): Promise<StoredProfilePhoto | null>;

  /**
   * Applies every change and increments version by one only when `id + expectedVersion` match,
   * in a single users_db transaction. Any conflict leaves the profile and photo untouched.
   */
  updateProfile(
    userId: string,
    expectedVersion: number,
    changes: ProfileChanges,
  ): Promise<ProfileUpdateResult>;
}
