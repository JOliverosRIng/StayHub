import type { Profile, ProfileRepository, Photo } from '../ports/profile.repository';
import { UserId } from '@users/domain/users/values';
import { parseProfilePatch } from '@users/domain/profiles/profile.policy';
export class UpdateOwnProfile {
  constructor(private readonly profiles: ProfileRepository) {}
  execute(id: string, input: unknown, photo?: Photo): Promise<Profile> { return this.profiles.update(UserId.parse(id), parseProfilePatch(input, photo !== undefined), photo); }
}
