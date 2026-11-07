import { DomainError } from '@reviews/domain/shared/domain-error';

export class Rating {
  private constructor(public readonly value: number) {}
  public static create(value: unknown): Rating {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) throw new DomainError('INVALID_RATING');
    return new Rating(value);
  }
}
