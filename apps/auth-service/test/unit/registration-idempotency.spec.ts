import { RegistrationPolicy } from '@auth/domain/registrations/registration-policy';

describe('registration request fingerprint', () => {
  const secret = 'a-secure-registration-secret-of-32-characters';
  const policy = new RegistrationPolicy(secret);
  const request = {
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    password: 'not-stored-in-the-fingerprint',
    role: 'OWNER' as const,
  };

  it('is stable for the same canonical request', () => {
    expect(policy.fingerprint(request)).toBe(policy.fingerprint({ ...request }));
    expect(policy.fingerprint(request)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when the payload associated with the same idempotency key changes', () => {
    expect(policy.fingerprint(request)).not.toBe(
      policy.fingerprint({ ...request, email: 'other@example.test' }),
    );
    expect(policy.fingerprint(request)).not.toBe(
      policy.fingerprint({ ...request, password: 'another-password-value' }),
    );
  });

  it('does not contain the raw password', () => {
    expect(policy.fingerprint(request)).not.toContain(request.password);
  });
});

