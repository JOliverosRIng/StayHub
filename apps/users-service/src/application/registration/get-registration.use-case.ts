import type { UserRepository, UserSummary } from '../ports/user.repository';
import { DomainError } from '@users/domain/shared/domain-error';
import { RegistrationId } from '@users/domain/users/values';
export class GetRegistration {
  constructor(private readonly users: UserRepository) {}
  async execute(id: string): Promise<UserSummary> {
    const registration = await this.users.findByRegistrationId(RegistrationId.parse(id));
    if (!registration) throw new DomainError('NOT_FOUND');
    return registration;
  }
}
