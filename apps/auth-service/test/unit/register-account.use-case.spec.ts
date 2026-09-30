import { randomUUID } from 'node:crypto';

import type { RegisterAccountCommand } from '@auth/application/ports/auth-use-cases.port';
import type { PasswordHasher } from '@auth/application/ports/password-hasher.port';
import type {
  RegistrationClaimOneResult,
  RegistrationWorkContext,
  RegistrationWorkPort,
} from '@auth/application/ports/registration-work.port';
import type {
  RegistrationIdentity,
  UsersServicePort,
} from '@auth/application/ports/users-service.port';
import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  RegistrationCancelledError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import {
  AdvanceRegistrationService,
  normalizeRegistrationInput,
  type RegistrationUsersPort,
} from '@auth/application/registration/advance-registration.service';
import { RegisterAccountService } from '@auth/application/registration/register-account.use-case';
import { Credential } from '@auth/domain/credentials/credential';
import { Registration } from '@auth/domain/registrations/registration';
import { RegistrationPolicy } from '@auth/domain/registrations/registration-policy';
import { FakeClock } from '../helpers/fake-clock';

const START = new Date('2026-09-28T12:00:00.000Z');
const TTL_SECONDS = 900;
const LEASE_SECONDS = 120;
const FINGERPRINT_SECRET = 'test-registration-fingerprint-secret-0123456';

function cloneRegistration(registration: Registration): Registration {
  return Registration.rehydrate(registration.snapshot());
}

function cloneCredential(credential: Credential): Credential {
  return Credential.rehydrate(credential.snapshot());
}

class InMemoryRegistrationWork implements RegistrationWorkPort {
  private readonly registrations = new Map<string, Registration>();
  private readonly credentials = new Map<string, Credential>();

  public seedRegistration(registration: Registration): void {
    this.registrations.set(registration.snapshot().id, cloneRegistration(registration));
  }

  public seedCredential(credential: Credential): void {
    this.credentials.set(credential.snapshot().userId, cloneCredential(credential));
  }

  public registrationOf(id: string): Registration | null {
    const registration = this.registrations.get(id);
    return registration === undefined ? null : cloneRegistration(registration);
  }

  public credentialOf(userId: string): Credential | null {
    const credential = this.credentials.get(userId);
    return credential === undefined ? null : cloneCredential(credential);
  }

  public createOrRead(registration: Registration): Promise<Registration> {
    const id = registration.snapshot().id;
    const existing = this.registrations.get(id);
    if (existing !== undefined) return Promise.resolve(cloneRegistration(existing));
    this.registrations.set(id, cloneRegistration(registration));
    return Promise.resolve(cloneRegistration(registration));
  }

  public claimOne(
    id: string,
    owner: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<RegistrationClaimOneResult> {
    const current = this.registrations.get(id);
    if (current === undefined) return Promise.resolve({ status: 'missing' });
    const state = current.snapshot().state;
    if (state === 'COMPLETED' || state === 'CANCELLED') {
      return Promise.resolve({ status: 'terminal', registration: cloneRegistration(current) });
    }
    if (current.isLeaseHeldBy(current.snapshot().processingOwner ?? '', now)) {
      return Promise.resolve({ status: 'busy' });
    }
    const claimed = cloneRegistration(current);
    claimed.claim(owner, leaseUntil, now);
    this.registrations.set(id, cloneRegistration(claimed));
    return Promise.resolve({ status: 'claimed', registration: claimed });
  }

  public claimBatch(): Promise<readonly Registration[]> {
    return Promise.resolve([]);
  }

  public renew(): Promise<Registration | null> {
    return Promise.resolve(null);
  }

  public release(id: string, owner: string, now: Date): Promise<boolean> {
    const current = this.registrations.get(id);
    if (current === undefined) return Promise.resolve(false);
    if (!current.isLeaseHeldBy(owner, now)) return Promise.resolve(false);
    const released = cloneRegistration(current);
    released.releaseLease(now);
    this.registrations.set(id, cloneRegistration(released));
    return Promise.resolve(true);
  }

  public transaction<T>(work: (context: RegistrationWorkContext) => Promise<T>): Promise<T> {
    return work({
      registrations: {
        findById: (id: string): Promise<Registration | null> => Promise.resolve(this.registrationOf(id)),
        save: (registration: Registration): Promise<void> => {
          this.registrations.set(registration.snapshot().id, cloneRegistration(registration));
          return Promise.resolve();
        },
        withLocked: async <T>(
          id: string,
          handler: (registration: Registration | null) => Promise<T>,
        ): Promise<T> => {
          const registration = this.registrationOf(id);
          const result = await handler(registration);
          if (registration !== null) {
            this.registrations.set(id, cloneRegistration(registration));
          }
          return result;
        },
      },
      credentials: {
        findByUserId: (userId: string): Promise<Credential | null> =>
          Promise.resolve(this.credentialOf(userId)),
        save: (credential: Credential): Promise<void> => {
          this.credentials.set(credential.snapshot().userId, cloneCredential(credential));
          return Promise.resolve();
        },
      },
    });
  }
}

class FakeUsers implements RegistrationUsersPort {
  public readonly calls: string[] = [];
  public activateReturns: 'ACTIVE' | 'PENDING' = 'ACTIVE';
  public createError: Error | null = null;
  private readonly users = new Map<string, RegistrationIdentity>();
  private readonly emails = new Map<string, string>();

  public seedUser(registrationId: string, identity: RegistrationIdentity): void {
    this.users.set(registrationId, identity);
    this.emails.set(identity.email.toLowerCase(), registrationId);
  }

  public createPendingUser(
    command: Parameters<UsersServicePort['createPendingUser']>[0],
  ): Promise<RegistrationIdentity> {
    this.calls.push('create');
    if (this.createError !== null) return Promise.reject(this.createError);
    const existing = this.users.get(command.registrationId);
    if (existing !== undefined) return Promise.resolve(existing);
    if (this.emails.has(command.email.toLowerCase())) {
      return Promise.reject(new RegistrationConflictError());
    }
    const identity: RegistrationIdentity = {
      userId: command.userId,
      name: command.name,
      email: command.email,
      role: command.role,
      status: 'PENDING',
    };
    this.users.set(command.registrationId, identity);
    this.emails.set(command.email.toLowerCase(), command.registrationId);
    return Promise.resolve(identity);
  }

  public getRegistration(registrationId: string): Promise<RegistrationIdentity | null> {
    this.calls.push('get');
    return Promise.resolve(this.users.get(registrationId) ?? null);
  }

  public activateRegistration(registrationId: string): Promise<RegistrationIdentity> {
    this.calls.push('activate');
    const existing = this.users.get(registrationId);
    if (existing === undefined) return Promise.reject(new DependencyUnavailableError('users'));
    const next: RegistrationIdentity = { ...existing, status: this.activateReturns };
    if (this.activateReturns === 'ACTIVE') this.users.set(registrationId, next);
    return Promise.resolve(next);
  }

  public cancelRegistration(registrationId: string): Promise<void> {
    this.calls.push('cancel');
    const existing = this.users.get(registrationId);
    if (existing !== undefined) this.users.set(registrationId, { ...existing, status: 'CANCELLED' });
    return Promise.resolve();
  }
}

class CountingHasher implements PasswordHasher {
  public count = 0;

  public hash(password: string): Promise<string> {
    this.count += 1;
    return Promise.resolve(`hashed:${password}`);
  }

  public verify(hash: string, password: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${password}`);
  }

  public verifyWithEquivalentCost(hash: string | null, password: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${password}`);
  }
}

const policy = new RegistrationPolicy(FINGERPRINT_SECRET);

interface Harness {
  readonly work: InMemoryRegistrationWork;
  readonly users: FakeUsers;
  readonly hasher: CountingHasher;
  readonly clock: FakeClock;
  readonly useCase: RegisterAccountService;
}

function build(): Harness {
  const work = new InMemoryRegistrationWork();
  const users = new FakeUsers();
  const hasher = new CountingHasher();
  const clock = new FakeClock(START);
  const advance = new AdvanceRegistrationService(work, users, hasher, clock);
  const useCase = new RegisterAccountService({
    work,
    users,
    policy,
    advance,
    clock,
    uuids: { generate: randomUUID },
    settings: { ttlSeconds: TTL_SECONDS, leaseSeconds: LEASE_SECONDS },
  });
  return { work, users, hasher, clock, useCase };
}

function command(overrides: Partial<RegisterAccountCommand> = {}): RegisterAccountCommand {
  return {
    idempotencyKey: randomUUID(),
    input: {
      name: 'Jane Guest',
      email: 'jane.guest@example.test',
      password: 'Correct-Horse-42',
      role: 'GUEST',
    },
    traceId: 'trace-unit-12345678',
    ...overrides,
  };
}

describe('RegisterAccountService (AUTH-040)', () => {
  it('runs the D03 order, hashes once and completes with both sides ACTIVE', async () => {
    const { work, users, hasher, useCase } = build();
    const cmd = command();

    const result = await useCase.execute(cmd);

    expect(users.calls).toEqual(['create', 'get', 'activate', 'get']);
    expect(hasher.count).toBe(1);
    expect(result).toEqual({
      id: expect.any(String) as unknown as string,
      name: 'Jane Guest',
      email: 'jane.guest@example.test',
      role: 'GUEST',
    });
    expect(work.registrationOf(cmd.idempotencyKey)?.snapshot().state).toBe('COMPLETED');
    expect(work.credentialOf(result.id)?.snapshot()).toMatchObject({
      status: 'ACTIVE',
      passwordHash: 'hashed:Correct-Horse-42',
    });
    expect(await users.getRegistration(cmd.idempotencyKey)).toMatchObject({ status: 'ACTIVE' });
  });

  it('returns the same id on repetition without duplicating rows', async () => {
    const { work, users, useCase } = build();
    const cmd = command();

    const first = await useCase.execute(cmd);
    const callsAfterFirst = users.calls.length;
    const second = await useCase.execute(cmd);

    expect(second).toEqual(first);
    expect(users.calls.slice(callsAfterFirst)).toEqual(['get']);
    expect(work.registrationOf(cmd.idempotencyKey)?.snapshot().state).toBe('COMPLETED');
  });

  it('rejects the same key with a different fingerprint without touching Users', async () => {
    const { users, useCase } = build();
    const cmd = command();
    await useCase.execute(cmd);
    const callsAfterFirst = users.calls.length;

    await expect(
      useCase.execute(
        command({
          idempotencyKey: cmd.idempotencyKey,
          input: {
            name: 'Other Person',
            email: 'other.person@example.test',
            password: 'Another-Password-42',
            role: 'OWNER',
          },
        }),
      ),
    ).rejects.toThrow(IdempotencyConflictError);

    expect(users.calls.length).toBe(callsAfterFirst);
  });

  it('resumes a USER_PENDING registration without recalculating the hash', async () => {
    const { work, users, hasher, useCase } = build();
    const registrationId = randomUUID();
    const userId = randomUUID();
    const cmd = command({ idempotencyKey: registrationId });
    const fingerprint = policy.fingerprint(normalizeRegistrationInput(cmd.input));
    const registration = Registration.create(
      registrationId,
      fingerprint,
      userId,
      START,
      new Date(START.getTime() + TTL_SECONDS * 1000),
    );
    registration.replaceState('USER_PENDING', START);
    work.seedRegistration(registration);
    work.seedCredential(Credential.create(userId, `hashed:${cmd.input.password}`, START));
    users.seedUser(registrationId, {
      userId,
      name: cmd.input.name,
      email: cmd.input.email,
      role: 'GUEST',
      status: 'PENDING',
    });

    const result = await useCase.execute(cmd);

    expect(hasher.count).toBe(0);
    expect(result.id).toBe(userId);
    expect(work.registrationOf(registrationId)?.snapshot().state).toBe('COMPLETED');
  });

  it('returns a retryable error when another worker holds the lease', async () => {
    const { work, users, useCase } = build();
    const registrationId = randomUUID();
    const userId = randomUUID();
    const cmd = command({ idempotencyKey: registrationId });
    const fingerprint = policy.fingerprint(normalizeRegistrationInput(cmd.input));
    const registration = Registration.create(
      registrationId,
      fingerprint,
      userId,
      START,
      new Date(START.getTime() + TTL_SECONDS * 1000),
    );
    work.seedRegistration(registration);
    await work.claimOne(registrationId, 'other-worker', START, new Date(START.getTime() + 60_000));

    await expect(useCase.execute(cmd)).rejects.toThrow(DependencyUnavailableError);

    expect(users.calls).toEqual([]);
  });

  it('preserves checkpoints, records a safe failure and releases the lease on retry', async () => {
    const { work, users, useCase } = build();
    const cmd = command();
    users.createError = new DependencyUnavailableError('users');

    await expect(useCase.execute(cmd)).rejects.toThrow(DependencyUnavailableError);
    const failed = work.registrationOf(cmd.idempotencyKey)?.snapshot();
    expect(failed?.state).toBe('STARTED');
    expect(failed?.lastErrorCode).toBe('DEPENDENCY_UNAVAILABLE');
    expect(failed?.processingOwner).toBeNull();
    expect(failed?.attemptCount).toBe(1);

    users.createError = null;
    const result = await useCase.execute(cmd);

    expect(result).toEqual(expect.objectContaining({ email: 'jane.guest@example.test' }));
    expect(work.registrationOf(cmd.idempotencyKey)?.snapshot().state).toBe('COMPLETED');
  });

  it('does not complete when Users does not confirm ACTIVE', async () => {
    const { work, users, useCase } = build();
    const cmd = command();
    users.activateReturns = 'PENDING';

    await expect(useCase.execute(cmd)).rejects.toThrow(DependencyUnavailableError);

    expect(work.registrationOf(cmd.idempotencyKey)?.snapshot().state).not.toBe('COMPLETED');
  });

  it('rejects a cancelled registration', async () => {
    const { work, useCase } = build();
    const registrationId = randomUUID();
    const userId = randomUUID();
    const cmd = command({ idempotencyKey: registrationId });
    const fingerprint = policy.fingerprint(normalizeRegistrationInput(cmd.input));
    const registration = Registration.create(
      registrationId,
      fingerprint,
      userId,
      START,
      new Date(START.getTime() + TTL_SECONDS * 1000),
    );
    registration.replaceState('CANCELLED', START);
    work.seedRegistration(registration);

    await expect(useCase.execute(cmd)).rejects.toThrow(RegistrationCancelledError);
  });
});
