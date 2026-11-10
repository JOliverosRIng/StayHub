export type BookingErrorCode =
  | 'VALIDATION_ERROR' | 'BOOKING_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'IDEMPOTENCY_IN_PROGRESS'
  | 'STATE_CONFLICT' | 'NOT_FOUND' | 'FORBIDDEN' | 'DEPENDENCY_UNAVAILABLE'
  | 'CANCELLATION_NOT_ALLOWED'
  | 'DEPENDENCY_INVALID_RESPONSE' | 'DEPENDENCY_REJECTED' | 'ACCOMMODATION_NOT_FOUND'
  | 'ACCOMMODATION_CONFLICT' | 'PAYMENT_REJECTED' | 'PAYMENT_BOOKING_MISMATCH'
  | 'EVENT_ID_CONFLICT' | 'INVALID_EVENT' | 'PAYMENT_BOOKING_NOT_READY' | 'SERVICE_CREDENTIALS_UNAVAILABLE';
export class DomainError extends Error {
  public constructor(public readonly code: BookingErrorCode, public readonly field?: string) { super(code); }
}
export function invalid(field: string): never { throw new DomainError('VALIDATION_ERROR', field); }
