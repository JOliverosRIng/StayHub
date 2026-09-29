import type { UserRepository } from '../ports/user.repository';
import { RegistrationId } from '@users/domain/users/values';
export class CancelPendingUser {
  constructor(private readonly users: UserRepository) {}
  async execute(id: string): Promise<void> { await this.users.transition(RegistrationId.parse(id), 'CANCELLED'); }
}
