export type Role = 'GUEST' | 'OWNER' | 'ADMIN';
export type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED';
export interface PendingUser { registrationId: string; userId: string; name: string; email: string; role: 'GUEST' | 'OWNER' }
export interface UserSummary { id: string; name: string; email: string; role: Role; status: RegistrationStatus }
export interface LoginIdentity { userId: string; role: Role; status: 'ACTIVE' }
export interface UserRepository {
  create(command: PendingUser): Promise<UserSummary>;
  transition(registrationId: string, status: 'ACTIVE' | 'CANCELLED'): Promise<UserSummary>;
}
export interface LoginIdentityRepository { findActiveLoginIdentityByNormalizedEmail(email: string): Promise<LoginIdentity | null> }
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const LOGIN_IDENTITY_REPOSITORY = Symbol('LOGIN_IDENTITY_REPOSITORY');
