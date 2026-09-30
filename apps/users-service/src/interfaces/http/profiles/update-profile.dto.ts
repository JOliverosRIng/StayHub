import { parseProfilePatch } from '@users/domain/profiles/profile.policy';
import type { ProfilePatch } from '@users/domain/profiles/profile.types';
export class UpdateProfileDto {
  static parse(body: unknown, hasPhoto: boolean): ProfilePatch { return parseProfilePatch(body, hasPhoto); }
}
