import type { ProfileRepository } from './profile.repository';
import type { UserRepository } from './user.repository';

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface TransactionalRepositories {
  readonly users: UserRepository;
  readonly profiles: ProfileRepository;
}

export interface UnitOfWork {
  /** Runs `work` in one local users_db transaction; a thrown error rolls everything back. */
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>;
}
