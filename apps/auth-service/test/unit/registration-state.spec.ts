import { RegistrationStateMachine } from '@auth/domain/registrations/registration-state-machine';
import { InvalidStateTransitionError } from '@auth/domain/shared/domain-error';

describe('RegistrationStateMachine', () => {
  const machine = new RegistrationStateMachine();

  it('supports the successful registration path', () => {
    let state = machine.transition('STARTED', 'USER_PENDING');
    state = machine.transition(state, 'CREDENTIAL_PENDING');
    state = machine.transition(state, 'CREDENTIAL_ACTIVE');
    state = machine.transition(state, 'COMPLETED');
    expect(state).toBe('COMPLETED');
  });

  it('supports compensation without authenticable partial completion', () => {
    expect(machine.transition('CREDENTIAL_PENDING', 'COMPENSATING')).toBe('COMPENSATING');
    expect(machine.transition('COMPENSATING', 'CANCELLED')).toBe('CANCELLED');
  });

  it('rejects skips and transitions out of terminal states', () => {
    expect(() => machine.transition('STARTED', 'COMPLETED')).toThrow(InvalidStateTransitionError);
    expect(() => machine.transition('COMPLETED', 'COMPENSATING')).toThrow(InvalidStateTransitionError);
  });

  it('requires compensation after expiry or maximum attempts', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    expect(machine.shouldCompensate('USER_PENDING', now, now, 0, 5)).toBe(true);
    expect(machine.shouldCompensate('USER_PENDING', now, new Date(now.getTime() + 1000), 5, 5)).toBe(true);
    expect(machine.shouldCompensate('COMPLETED', now, now, 5, 5)).toBe(false);
  });
});

