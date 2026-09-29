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
  readonly processingOwner: string | null;
  readonly leaseUntil: Date | null;
  readonly nextAttemptAt: Date;
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
      processingOwner: null,
      leaseUntil: null,
      nextAttemptAt: now,
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

  public claim(owner: string, leaseUntil: Date, now: Date): void {
    if (owner === '' || leaseUntil <= now) {
      throw new DomainValidationError('INVALID_LEASE', 'Registration lease is invalid');
    }
    this.properties = {
      ...this.properties,
      processingOwner: owner,
      leaseUntil,
      updatedAt: now,
    };
  }

  public renewLease(leaseUntil: Date, now: Date): void {
    if (this.properties.processingOwner === null || leaseUntil <= now) {
      throw new DomainValidationError('INVALID_LEASE', 'Registration lease cannot be renewed');
    }
    this.properties = { ...this.properties, leaseUntil, updatedAt: now };
  }

  public releaseLease(now: Date): void {
    this.properties = {
      ...this.properties,
      processingOwner: null,
      leaseUntil: null,
      updatedAt: now,
    };
  }

  public scheduleNextAttempt(nextAttemptAt: Date, now: Date): void {
    if (nextAttemptAt < this.properties.createdAt) {
      throw new DomainValidationError('INVALID_NEXT_ATTEMPT', 'Next attempt cannot precede creation');
    }
    this.properties = { ...this.properties, nextAttemptAt, updatedAt: now };
  }

  public isLeaseHeldBy(owner: string, now: Date): boolean {
    return (
      this.properties.processingOwner === owner &&
      this.properties.leaseUntil !== null &&
      this.properties.leaseUntil >= now
    );
  }

  public snapshot(): RegistrationProperties {
    return { ...this.properties };
  }
}
