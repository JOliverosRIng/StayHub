import type { Review } from '@reviews/domain/reviews/review';
export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');
export interface ReviewRepository { findByBookingId(bookingId: string): Promise<Review | null>; }
