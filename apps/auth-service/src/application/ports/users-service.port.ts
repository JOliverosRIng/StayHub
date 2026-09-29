export const USERS_SERVICE = Symbol('USERS_SERVICE');

export type UserRole = 'GUEST' | 'OWNER' | 'ADMIN';

export interface PendingUserCommand {
  readonly registrationId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Exclude<UserRole, 'ADMIN'>;
}

export interface RegistrationIdentity {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
}

export interface LoginIdentity {
  readonly userId: string;
  readonly role: UserRole;
  readonly status: 'ACTIVE';
}

export interface UsersServicePort {
  createPendingUser(command: PendingUserCommand, traceId: string): Promise<RegistrationIdentity>;
  getRegistration(
    registrationId: string,
    traceId: string,
  ): Promise<RegistrationIdentity | null>;
  activateRegistration(
    registrationId: string,
    traceId: string,
  ): Promise<RegistrationIdentity>;
  cancelRegistration(registrationId: string, traceId: string): Promise<void>;
  resolveLoginIdentity(
    normalizedEmail: string,
    traceId: string,
  ): Promise<LoginIdentity | null>;
}
