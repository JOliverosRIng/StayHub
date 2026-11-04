export type ErrorCode =
  | 'VALIDATION_ERROR' | 'VERSION_CONFLICT' | 'PUBLICATION_INCOMPLETE' | 'PHOTO_LIMIT_REACHED' | 'STATE_CONFLICT'
  | 'NOT_FOUND' | 'FORBIDDEN' | 'PHOTO_TOO_LARGE' | 'PHOTO_MEDIA_TYPE' | 'UNAVAILABLE';
export interface FieldError { field: string; code: 'INVALID_VALUE' }
export class DomainError extends Error {
  constructor(readonly code: ErrorCode, readonly errors: readonly FieldError[] = []) { super(code); }
}
export function invalid(field: string): never { throw new DomainError('VALIDATION_ERROR', [{ field, code: 'INVALID_VALUE' }]); }
