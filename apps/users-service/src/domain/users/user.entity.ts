import { DomainError } from '../shared/domain-error';
import type { UserStatus } from './values';
export class User {
  static transition(current: UserStatus, target: 'ACTIVE' | 'CANCELLED'): UserStatus {
    if (current !== 'PENDING' && current !== target) throw new DomainError('STATE_CONFLICT');
    return target;
  }
}
