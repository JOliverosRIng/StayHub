import { DomainError } from '@reviews/domain/shared/domain-error';

export function assertReviewOwnership(principalSub: string, userId: string): void {
  if (principalSub !== userId) throw new DomainError('FORBIDDEN');
}
