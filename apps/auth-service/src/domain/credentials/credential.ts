import { DomainValidationError } from '@auth/domain/shared/domain-error';

export type CredentialStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface CredentialProperties {
  readonly userId: string;
  readonly passwordHash: string;
  readonly status: CredentialStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Credential {
  private constructor(private properties: CredentialProperties) {}

  public static create(userId: string, passwordHash: string, now: Date): Credential {
    if (userId === '' || passwordHash === '') {
      throw new DomainValidationError('INVALID_CREDENTIAL', 'Credential fields are required');
    }
    return new Credential({ userId, passwordHash, status: 'PENDING', createdAt: now, updatedAt: now });
  }

  public static rehydrate(properties: CredentialProperties): Credential {
    return new Credential(properties);
  }

  public activate(now: Date): void {
    if (this.properties.status !== 'PENDING') {
      throw new DomainValidationError('CREDENTIAL_NOT_PENDING', 'Only pending credentials can activate');
    }
    this.properties = { ...this.properties, status: 'ACTIVE', updatedAt: now };
  }

  public revoke(now: Date): void {
    this.properties = { ...this.properties, status: 'REVOKED', updatedAt: now };
  }

  public snapshot(): CredentialProperties {
    return { ...this.properties };
  }
}

