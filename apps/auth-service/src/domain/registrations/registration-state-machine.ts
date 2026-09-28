import { InvalidStateTransitionError } from '@auth/domain/shared/domain-error';
import type { RegistrationState } from './registration';

const FORWARD: Readonly<Record<RegistrationState, readonly RegistrationState[]>> = {
  STARTED: ['USER_PENDING', 'COMPENSATING'],
  USER_PENDING: ['CREDENTIAL_PENDING', 'COMPENSATING'],
  CREDENTIAL_PENDING: ['CREDENTIAL_ACTIVE', 'COMPENSATING'],
  CREDENTIAL_ACTIVE: ['COMPLETED', 'COMPENSATING'],
  COMPLETED: [],
  COMPENSATING: ['CANCELLED'],
  CANCELLED: [],
};

export class RegistrationStateMachine {
  public transition(from: RegistrationState, to: RegistrationState): RegistrationState {
    if (!FORWARD[from].includes(to)) throw new InvalidStateTransitionError(from, to);
    return to;
  }

  public shouldCompensate(
    state: RegistrationState,
    now: Date,
    expiresAt: Date,
    attempts: number,
    maximumAttempts: number,
  ): boolean {
    return !['COMPLETED', 'CANCELLED'].includes(state) &&
      (now >= expiresAt || attempts >= maximumAttempts);
  }
}

