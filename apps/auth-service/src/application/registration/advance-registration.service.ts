import type { Clock } from '@auth/application/ports/clock.port';
import type {
  RegisterAccountInput,
  RegistrationRole,
} from '@auth/application/ports/auth-use-cases.port';
import type { PasswordHasher } from '@auth/application/ports/password-hasher.port';
import type { RegistrationWorkPort } from '@auth/application/ports/registration-work.port';
import type { UserRole, UsersServicePort } from '@auth/application/ports/users-service.port';
import { DependencyUnavailableError } from '@auth/application/errors/auth-errors';
import { Credential } from '@auth/domain/credentials/credential';
import type { Registration, RegistrationState } from '@auth/domain/registrations/registration';

export type RegistrationUsersPort = Pick<
  UsersServicePort,
  'createPendingUser' | 'getRegistration' | 'activateRegistration' | 'cancelRegistration'
>;

export type AdvanceRegistrationOutcome = 'completed' | 'waiting';

export function normalizeRegistrationInput(input: RegisterAccountInput): RegisterAccountInput {
  return {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    role: input.role,
  };
}

export function toRegistrationRole(role: UserRole): RegistrationRole {
  if (role === 'ADMIN') throw new DependencyUnavailableError('users');
  return role;
}

export class AdvanceRegistrationService {
  public constructor(
    private readonly work: RegistrationWorkPort,
    private readonly users: RegistrationUsersPort,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  public async advance(
    registration: Registration,
    input: RegisterAccountInput | null,
    traceId: string,
  ): Promise<AdvanceRegistrationOutcome> {
    const now = this.clock.now();
    let state = registration.snapshot().state;
    const registrationId = registration.snapshot().id;
    const userId = registration.snapshot().userId;

    if (state === 'COMPLETED' || state === 'CANCELLED') return 'completed';
    if (state === 'COMPENSATING') return 'waiting';

    if (state === 'STARTED') {
      if (input === null) return 'waiting';
      await this.users.createPendingUser(
        { registrationId, userId, name: input.name, email: input.email, role: input.role },
        traceId,
      );
      await this.persistState(registration, 'USER_PENDING', now);
      state = 'USER_PENDING';
    }

    if (state === 'USER_PENDING') {
      let credential = await this.findCredential(userId);
      if (credential === null) {
        if (input === null) return 'waiting';
        const passwordHash = await this.hasher.hash(input.password);
        credential = Credential.create(userId, passwordHash, now);
      }
      await this.persistCredentialAndState(registration, credential, 'CREDENTIAL_PENDING', now);
      state = 'CREDENTIAL_PENDING';
    }

    if (state === 'CREDENTIAL_PENDING') {
      const credential = await this.findCredential(userId);
      if (credential === null) return 'waiting';
      if (credential.snapshot().status === 'PENDING') credential.activate(now);
      await this.persistCredentialAndState(registration, credential, 'CREDENTIAL_ACTIVE', now);
      state = 'CREDENTIAL_ACTIVE';
    }

    const remote = await this.users.getRegistration(registrationId, traceId);
    if (remote !== null && remote.status === 'CANCELLED') {
      await this.revokeCredential(userId, now);
      await this.persistState(registration, 'CANCELLED', now);
      return 'completed';
    }
    if (remote === null || remote.status === 'PENDING') {
      const activated = await this.users.activateRegistration(registrationId, traceId);
      if (activated.status !== 'ACTIVE') throw new DependencyUnavailableError('users');
    }

    const credential = await this.findCredential(userId);
    if (credential === null || credential.snapshot().status !== 'ACTIVE') {
      throw new DependencyUnavailableError('users');
    }
    await this.persistState(registration, 'COMPLETED', now);
    return 'completed';
  }

  public async recordTransientFailure(registration: Registration, owner: string): Promise<void> {
    try {
      const now = this.clock.now();
      registration.recordFailure('DEPENDENCY_UNAVAILABLE', now);
      registration.scheduleNextAttempt(now, now);
      await this.work.transaction(async (context) => {
        await context.registrations.save(registration);
      });
      await this.work.release(registration.snapshot().id, owner, now);
    } catch {
      // Keep the caller's retryable outcome; never surface a raw persistence failure.
    }
  }

  private async findCredential(userId: string): Promise<Credential | null> {
    return this.work.transaction((context) => context.credentials.findByUserId(userId));
  }

  private async persistState(
    registration: Registration,
    state: RegistrationState,
    now: Date,
  ): Promise<void> {
    registration.replaceState(state, now);
    await this.work.transaction(async (context) => {
      await context.registrations.save(registration);
    });
  }

  private async persistCredentialAndState(
    registration: Registration,
    credential: Credential,
    state: RegistrationState,
    now: Date,
  ): Promise<void> {
    registration.replaceState(state, now);
    await this.work.transaction(async (context) => {
      await context.credentials.save(credential);
      await context.registrations.save(registration);
    });
  }

  private async revokeCredential(userId: string, now: Date): Promise<void> {
    const credential = await this.findCredential(userId);
    if (credential !== null && credential.snapshot().status !== 'REVOKED') {
      credential.revoke(now);
      await this.work.transaction(async (context) => {
        await context.credentials.save(credential);
      });
    }
  }
}
