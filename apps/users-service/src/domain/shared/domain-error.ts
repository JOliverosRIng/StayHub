export type ErrorCode = 'VALIDATION_ERROR' | 'EMAIL_CONFLICT' | 'VERSION_CONFLICT' | 'STATE_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'NOT_FOUND' | 'FORBIDDEN' | 'PHOTO_TOO_LARGE' | 'PHOTO_MEDIA_TYPE' | 'UNAVAILABLE';
export interface FieldError { field: string; code: string }
export class DomainError extends Error {
  constructor(readonly code: ErrorCode, readonly errors: readonly FieldError[] = []) { super(code); }
}
export function invalid(field: string): never { throw new DomainError('VALIDATION_ERROR', [{ field, code: 'INVALID_VALUE' }]); }
