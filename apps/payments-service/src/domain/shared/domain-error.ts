export const DOMAIN_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'FORBIDDEN',
  'IDEMPOTENCY_CONFLICT',
  'STATE_CONFLICT',
  'REFUND_AMOUNT_INVALID',
  'UNAVAILABLE',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class DomainError extends Error {
  readonly fieldErrors: readonly FieldError[];

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    fieldErrors: readonly FieldError[] = [],
  ) {
    super(message);
    this.name = 'DomainError';
    this.fieldErrors = fieldErrors.map(({ field, message: fieldMessage }) => ({
      field,
      message: fieldMessage,
    }));
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
