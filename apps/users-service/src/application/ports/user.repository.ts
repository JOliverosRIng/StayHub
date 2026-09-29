export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export type UserRole = 'GUEST' | 'OWNER' | 'ADMIN';
export type PublicRole = Exclude<UserRole, 'ADMIN'>;
export type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED';
export type PreferenceValue = string | number | boolean;
export type Preferences = Readonly<Record<string, PreferenceValue>>;

export interface UserSnapshot {
  readonly id: string;
  readonly registrationId: string;
  readonly name: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly role: UserRole;
  readonly status: RegistrationStatus;
  readonly phone: string | null;
  readonly preferences: Preferences | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewPendingUser {
  readonly id: string;
  readonly registrationId: string;
  readonly name: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly role: PublicRole;
}

export interface LoginIdentity {
  readonly userId: string;
  readonly role: UserRole;
  readonly status: 'ACTIVE';
}

export type CreatePendingUserResult =
  | { readonly outcome: 'created'; readonly user: UserSnapshot }
  | { readonly outcome: 'email-conflict' }
  | { readonly outcome: 'registration-conflict' };

export interface UserRepository {
  /** Inserts a PENDING user; uniqueness of emailNormalized and registrationId is enforced by users_db. */
  createPending(user: NewPendingUser): Promise<CreatePendingUserResult>;

  findByRegistrationId(registrationId: string): Promise<UserSnapshot | null>;

  /** Conditional transition: returns null when the user is not currently in `from`. */
  transitionStatus(
    registrationId: string,
    from: 'PENDING',
    to: Exclude<RegistrationStatus, 'PENDING'>,
  ): Promise<UserSnapshot | null>;

  findActiveById(userId: string): Promise<UserSnapshot | null>;

  findActiveLoginIdentityByNormalizedEmail(emailNormalized: string): Promise<LoginIdentity | null>;
}
