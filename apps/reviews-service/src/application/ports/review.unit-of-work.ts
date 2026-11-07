import type { Review } from '@reviews/domain/reviews/review';
export const REVIEW_UNIT_OF_WORK = Symbol('REVIEW_UNIT_OF_WORK');
export interface ReviewUnitOfWork { create(review: Review): Promise<Review>; }
