export interface FieldError {
  readonly field: string;
  readonly code: string;
}

export abstract class DomainError extends Error {
  protected constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class DomainValidationError extends DomainError {
  public constructor(public readonly errors: readonly FieldError[]) {
    super('VALIDATION_FAILED', 'Domain validation failed');
  }
}

export class InvalidStateTransitionError extends DomainError {
  public constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super('INVALID_STATE_TRANSITION', `Cannot transition from ${from} to ${to}`);
  }
}
