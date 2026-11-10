import { DomainError } from '@reviews/domain/shared/domain-error';

export class ReviewComment {
  private constructor(public readonly value: string) {}
  public static create(value: unknown): ReviewComment {
    if (typeof value !== 'string') throw new DomainError('INVALID_COMMENT');
    const normalized = value.trim();
    const unicodeLength = Array.from(normalized).length;
    if (unicodeLength < 1 || unicodeLength > 2000) throw new DomainError('INVALID_COMMENT');
    return new ReviewComment(normalized);
  }
}
