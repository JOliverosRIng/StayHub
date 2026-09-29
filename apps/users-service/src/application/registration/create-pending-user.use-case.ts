import type { PendingUser, UserRepository, UserSummary } from '../ports/user.repository';
import { Name, Email, Role, UserId, RegistrationId } from '@users/domain/users/values';
export class CreatePendingUser {
  constructor(private readonly users: UserRepository) {}
  execute(command: PendingUser): Promise<UserSummary> {
    return this.users.create({ userId: UserId.parse(command.userId), registrationId: RegistrationId.parse(command.registrationId), name: Name.parse(command.name), email: Email.parse(command.email).value, role: Role.public(command.role) });
  }
}
