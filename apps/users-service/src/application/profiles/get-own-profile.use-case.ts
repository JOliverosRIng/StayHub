import type { Profile, ProfileRepository } from '../ports/profile.repository';
import { DomainError } from '@users/domain/shared/domain-error';
import { UserId } from '@users/domain/users/values';
export class GetOwnProfile {
  constructor(private readonly profiles: ProfileRepository) {}
  async execute(id: string): Promise<Profile> { const profile = await this.profiles.find(UserId.parse(id)); if (!profile) throw new DomainError('NOT_FOUND'); return profile; }
}
