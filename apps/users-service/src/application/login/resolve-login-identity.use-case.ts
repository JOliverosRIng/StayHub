import type { LoginIdentityRepository, LoginIdentity } from '../ports/user.repository';
import { Email } from '@users/domain/users/values';
import { DomainError } from '@users/domain/shared/domain-error';
export class ResolveLoginIdentity {
  constructor(private readonly users: LoginIdentityRepository) {}
  async execute(email: string): Promise<LoginIdentity> {
    const identity = await this.users.findActiveLoginIdentityByNormalizedEmail(Email.parse(email).normalized);
    if (!identity || identity.status !== 'ACTIVE') throw new DomainError('NOT_FOUND');
    return { userId: identity.userId, role: identity.role, status: 'ACTIVE' };
  }
}
