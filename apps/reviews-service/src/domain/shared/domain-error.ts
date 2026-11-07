export type ReviewErrorCode =
  | 'INVALID_RATING'
  | 'INVALID_COMMENT'
  | 'INVALID_REVIEW'
  | 'REVIEW_ALREADY_EXISTS'
  | 'BOOKING_NOT_ELIGIBLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'SERVICE_CREDENTIALS_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'NOT_FOUND';

export class DomainError extends Error {
  public constructor(public readonly code: ReviewErrorCode) {
    super(code);
    this.name = 'DomainError';
  }
}
