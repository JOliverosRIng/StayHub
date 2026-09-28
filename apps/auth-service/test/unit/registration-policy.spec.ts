import { DomainValidationError } from '@auth/domain/shared/domain-error';
import { RegistrationPolicy, type RegistrationInput } from '@auth/domain/registrations/registration-policy';

describe('RegistrationPolicy', () => {
  const policy = new RegistrationPolicy('a-secure-registration-secret-of-32-characters');
  const valid: RegistrationInput = {
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    password: ' Exact Password ',
    role: 'GUEST',
  };

  it.each(['1234567', 'x'.repeat(129)])('rejects password outside 8-128 characters', (password) => {
    expect(() => policy.validate({ ...valid, password })).toThrow(DomainValidationError);
  });

  it('counts Unicode code points and preserves the exact password', () => {
    expect(() => policy.validate({ ...valid, password: '🔐🔐🔐🔐🔐🔐🔐🔐' })).not.toThrow();
    expect(policy.fingerprint(valid)).not.toEqual(
      policy.fingerprint({ ...valid, password: valid.password.trim() }),
    );
  });

  it.each(['GUEST', 'OWNER'] as const)('accepts public role %s', (role) => {
    expect(() => policy.validate({ ...valid, role })).not.toThrow();
  });

  it('rejects ADMIN self-registration', () => {
    expect(() => policy.validate({ ...valid, role: 'ADMIN' } as unknown as RegistrationInput)).toThrow(
      DomainValidationError,
    );
  });
});

