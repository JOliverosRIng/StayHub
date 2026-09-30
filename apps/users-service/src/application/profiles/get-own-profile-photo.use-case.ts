import type { Photo, ProfileRepository } from '../ports/profile.repository';
import { DomainError } from '@users/domain/shared/domain-error';
import { UserId } from '@users/domain/users/values';
export class GetOwnProfilePhoto {
  constructor(private readonly profiles: ProfileRepository) {}
  async execute(id: string): Promise<Photo> { const photo = await this.profiles.photo(UserId.parse(id)); if (!photo) throw new DomainError('NOT_FOUND'); return photo; }
}
