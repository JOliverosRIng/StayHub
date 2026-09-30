import type { Clock } from '@auth/application/ports/clock.port';
import type { UuidGenerator } from '@auth/application/ports/random.port';
import type { RegistrationWorkPort } from '@auth/application/ports/registration-work.port';
import {
  DependencyUnavailableError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import { Credential } from '@auth/domain/credentials/credential';
import type { Registration, RegistrationState } from '@auth/domain/registrations/registration';
import {
  AdvanceRegistrationService,
  type RegistrationUsersPort,
} from './advance-registration.service';

export const RECONCILE_REGISTRATIONS = Symbol('RECONCILE_REGISTRATIONS');

export interface ReconcileTickResult {
  readonly claimed: number;
  readonly completed: number;
  readonly waiting: number;
  readonly compensating: number;
}

export interface ReconcileRegistrations {
  execute(): Promise<ReconcileTickResult>;
}

export interface ReconcileSettings {
  readonly batchSize: number;
  readonly maxAttempts: number;
  readonly intervalSeconds: number;
  readonly leaseSeconds: number;
}

export function backoffSecondsFor(attempt: number): number {
  if (attempt <= 0) return 30;
  return Math.min(30 * 2 ** (attempt - 1), 300);
}

type RowOutcome = 'completed' | 'waiting' | 'compensating';

export class ReconcileRegistrationsUseCase implements ReconcileRegistrations {
  public constructor(
    private readonly work: RegistrationWorkPort,
    private readonly advance: AdvanceRegistrationService,
    private readonly users: RegistrationUsersPort,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
    private readonly settings: ReconcileSettings,
  ) {}

  public async execute(): Promise<ReconcileTickResult> {
    const now = this.clock.now();
    const owner = this.uuids.generate();
    const claimed = await this.work.claimBatch(
      owner,
      now,
      this.settings.batchSize,
      new Date(now.getTime() + this.settings.leaseSeconds * 1000),
    );

    let completed = 0;
    let waiting = 0;
    let compensating = 0;
    for (const registration of claimed) {
      const outcome = await this.reconcileOne(registration, owner, now);
      if (outcome === 'completed') completed += 1;
      else if (outcome === 'waiting') waiting += 1;
      else compensating += 1;
    }
    return { claimed: claimed.length, completed, waiting, compensating };
  }

  private async reconcileOne(
    registration: Registration,
    owner: string,
    now: Date,
  ): Promise<RowOutcome> {
    const snapshot = registration.snapshot();
    const registrationId = snapshot.id;
    const userId = snapshot.userId;
    const traceId = `reconciler-${this.uuids.generate()}`;

    if (snapshot.state === 'COMPLETED' || snapshot.state === 'CANCELLED') {
      await this.work.release(registrationId, owner, now);
      return 'completed';
    }
    if (snapshot.state === 'COMPENSATING') {
      return this.compensate(registration, owner, now, traceId);
    }

    const remote = await this.loadRemote(registrationId, traceId);
    if (remote === 'unavailable') {
      return this.rescheduleWaiting(registration, owner, now);
    }
    if (remote !== null && remote.status === 'ACTIVE') {
      await this.activateCredentialIfPending(userId, now);
      await this.persistState(registration, 'COMPLETED', now);
      await this.work.release(registrationId, owner, now);
      return 'completed';
    }
    if (remote !== null && remote.status === 'CANCELLED') {
      await this.revokeCredential(userId, now);
      await this.persistState(registration, 'CANCELLED', now);
      await this.work.release(registrationId, owner, now);
      return 'completed';
    }

    const credential = await this.findCredential(userId);
    const requiresPayload =
      snapshot.state === 'STARTED' || (snapshot.state === 'USER_PENDING' && credential === null);
    if (requiresPayload) {
      if (
        snapshot.expiresAt.getTime() <= now.getTime() ||
        snapshot.attemptCount >= this.settings.maxAttempts
      ) {
        return this.beginCompensation(registration, owner, now, traceId);
      }
      return this.rescheduleWaiting(registration, owner, now);
    }

    try {
      const outcome = await this.advance.advance(registration, null, traceId);
      if (outcome === 'completed') {
        await this.work.release(registrationId, owner, now);
        return 'completed';
      }
      return this.rescheduleWaiting(registration, owner, now);
    } catch (error) {
      if (error instanceof RegistrationConflictError) {
        return this.rescheduleWaiting(registration, owner, now);
      }
      return this.failAdvance(registration, owner, now, traceId);
    }
  }

  private async loadRemote(
    registrationId: string,
    traceId: string,
  ): Promise<{ readonly status: 'PENDING' | 'ACTIVE' | 'CANCELLED' } | null | 'unavailable'> {
    try {
      const identity = await this.users.getRegistration(registrationId, traceId);
      return identity === null ? null : { status: identity.status };
    } catch (error) {
      if (error instanceof DependencyUnavailableError) return 'unavailable';
      throw error;
    }
  }

  private async rescheduleWaiting(
    registration: Registration,
    owner: string,
    now: Date,
  ): Promise<RowOutcome> {
    registration.scheduleNextAttempt(
      new Date(now.getTime() + this.settings.intervalSeconds * 1000),
      now,
    );
    await this.persistState(registration, registration.snapshot().state, now);
    await this.work.release(registration.snapshot().id, owner, now);
    return 'waiting';
  }

  private async failAdvance(
    registration: Registration,
    owner: string,
    now: Date,
    traceId: string,
  ): Promise<RowOutcome> {
    registration.recordFailure('ADVANCE_FAILED', now);
    const attempt = registration.snapshot().attemptCount;
    if (attempt >= this.settings.maxAttempts) {
      return this.beginCompensation(registration, owner, now, traceId);
    }
    registration.scheduleNextAttempt(
      new Date(now.getTime() + backoffSecondsFor(attempt) * 1000),
      now,
    );
    await this.persistState(registration, registration.snapshot().state, now);
    await this.work.release(registration.snapshot().id, owner, now);
    return 'waiting';
  }

  private async beginCompensation(
    registration: Registration,
    owner: string,
    now: Date,
    traceId: string,
  ): Promise<RowOutcome> {
    await this.persistState(registration, 'COMPENSATING', now);
    return this.compensate(registration, owner, now, traceId);
  }

  private async compensate(
    registration: Registration,
    owner: string,
    now: Date,
    traceId: string,
  ): Promise<RowOutcome> {
    const registrationId = registration.snapshot().id;
    const userId = registration.snapshot().userId;
    try {
      await this.users.cancelRegistration(registrationId, traceId);
    } catch (error) {
      const remote = await this.loadRemote(registrationId, traceId);
      if (error instanceof RegistrationConflictError) {
        if (remote !== 'unavailable' && remote !== null && remote.status === 'ACTIVE') {
          return this.finishAsActive(registration, owner, now);
        }
      } else if (remote === null) {
        // Users confirma con un 404 autenticado que la identidad no existe (la
        // saga se interrumpió antes de crearla): el objetivo de la compensación
        // ya se cumple. 401/403/5xx/red siguen siendo 'unavailable' y se reintenta.
        // Una creación tardía posterior queda PENDING: Auth no activa registros
        // CANCELLED y el lookup de login solo resuelve identidades ACTIVE.
        await this.revokeCredential(userId, now);
        await this.persistState(registration, 'CANCELLED', now);
        await this.work.release(registrationId, owner, now);
        return 'completed';
      }
      await this.persistState(registration, 'COMPENSATING', now);
      await this.work.release(registrationId, owner, now);
      return 'compensating';
    }

    const remote = await this.loadRemote(registrationId, traceId);
    if (remote !== 'unavailable' && remote !== null && remote.status === 'ACTIVE') {
      return this.finishAsActive(registration, owner, now);
    }
    await this.revokeCredential(userId, now);
    await this.persistState(registration, 'CANCELLED', now);
    await this.work.release(registrationId, owner, now);
    return 'completed';
  }

  private async finishAsActive(
    registration: Registration,
    owner: string,
    now: Date,
  ): Promise<RowOutcome> {
    await this.activateCredentialIfPending(registration.snapshot().userId, now);
    await this.persistState(registration, 'COMPLETED', now);
    await this.work.release(registration.snapshot().id, owner, now);
    return 'completed';
  }

  private async findCredential(userId: string): Promise<Credential | null> {
    return this.work.transaction((context) => context.credentials.findByUserId(userId));
  }

  private async activateCredentialIfPending(userId: string, now: Date): Promise<void> {
    const credential = await this.findCredential(userId);
    if (credential === null || credential.snapshot().status !== 'PENDING') return;
    credential.activate(now);
    await this.work.transaction(async (context) => {
      await context.credentials.save(credential);
    });
  }

  private async revokeCredential(userId: string, now: Date): Promise<void> {
    const credential = await this.findCredential(userId);
    if (credential === null || credential.snapshot().status === 'REVOKED') return;
    credential.revoke(now);
    await this.work.transaction(async (context) => {
      await context.credentials.save(credential);
    });
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
}
