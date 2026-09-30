export abstract class DomainError extends Error {
  protected constructor(
    public readonly code: string,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class DomainValidationError extends DomainError {
  public constructor(code: string, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(code, message, details);
  }
}

export class InvalidStateTransitionError extends DomainError {
  public constructor(from: string, to: string) {
    super('INVALID_STATE_TRANSITION', `Cannot transition from ${from} to ${to}`, { from, to });
  }
}

