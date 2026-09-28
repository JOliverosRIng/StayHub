import { createHmac } from 'node:crypto';

import { DomainValidationError } from '@auth/domain/shared/domain-error';

export type PublicRegistrationRole = 'GUEST' | 'OWNER';

export interface RegistrationInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: PublicRegistrationRole;
}

export class RegistrationPolicy {
  public constructor(private readonly fingerprintSecret: string) {
    if (fingerprintSecret.length < 32) {
      throw new DomainValidationError('INVALID_FINGERPRINT_SECRET', 'Fingerprint secret is too short');
    }
  }

  public validate(input: RegistrationInput): void {
    const passwordLength = Array.from(input.password).length;
    if (passwordLength < 8 || passwordLength > 128) {
      throw new DomainValidationError(
        'INVALID_PASSWORD_LENGTH',
        'Password must contain between 8 and 128 characters',
      );
    }
    if (input.role !== 'GUEST' && input.role !== 'OWNER') {
      throw new DomainValidationError('INVALID_PUBLIC_ROLE', 'Only GUEST or OWNER may self-register');
    }
  }

  public fingerprint(input: RegistrationInput): string {
    this.validate(input);
    const passwordDigest = createHmac('sha256', this.fingerprintSecret)
      .update(input.password, 'utf8')
      .digest('hex');
    const canonical = JSON.stringify({
      email: input.email,
      name: input.name,
      passwordDigest,
      role: input.role,
    });
    return createHmac('sha256', this.fingerprintSecret).update(canonical, 'utf8').digest('hex');
  }
}

