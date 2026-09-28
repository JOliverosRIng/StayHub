import { DomainValidationError } from '@auth/domain/shared/domain-error';

export type RegistrationState =
  | 'STARTED'
  | 'USER_PENDING'
  | 'CREDENTIAL_PENDING'
  | 'CREDENTIAL_ACTIVE'
  | 'COMPLETED'
  | 'COMPENSATING'
  | 'CANCELLED';

export interface RegistrationProperties {
  readonly id: string;
  readonly requestFingerprint: string;
  readonly userId: string;
  readonly state: RegistrationState;
  readonly attemptCount: number;
  readonly lastErrorCode: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Registration {
  private constructor(private properties: RegistrationProperties) {}

  public static create(
    id: string,
    requestFingerprint: string,
    userId: string,
    now: Date,
    expiresAt: Date,
  ): Registration {
    if (requestFingerprint.length !== 64 || expiresAt <= now) {
      throw new DomainValidationError('INVALID_REGISTRATION', 'Registration data is invalid');
    }
    return new Registration({
      id,
      requestFingerprint,
      userId,
      state: 'STARTED',
      attemptCount: 0,
      lastErrorCode: null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(properties: RegistrationProperties): Registration {
    return new Registration(properties);
  }

  public replaceState(state: RegistrationState, now: Date): void {
    this.properties = { ...this.properties, state, updatedAt: now };
  }

  public recordFailure(safeErrorCode: string, now: Date): void {
    if (!/^[A-Z0-9_]{1,100}$/.test(safeErrorCode)) {
      throw new DomainValidationError('UNSAFE_ERROR_CODE', 'Registration error code is unsafe');
    }
    this.properties = {
      ...this.properties,
      attemptCount: this.properties.attemptCount + 1,
      lastErrorCode: safeErrorCode,
      updatedAt: now,
    };
  }

  public snapshot(): RegistrationProperties {
    return { ...this.properties };
  }
}

