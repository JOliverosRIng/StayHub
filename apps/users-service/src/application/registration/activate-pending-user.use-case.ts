import type { UserRepository, UserSummary } from '../ports/user.repository';
import { RegistrationId } from '@users/domain/users/values';
export class ActivatePendingUser {
  constructor(private readonly users: UserRepository) {}
  execute(id: string): Promise<UserSummary> { return this.users.transition(RegistrationId.parse(id), 'ACTIVE'); }
}
