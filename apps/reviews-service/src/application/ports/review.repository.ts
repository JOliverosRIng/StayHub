import type { Review } from '@reviews/domain/reviews/review';

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');

export interface ReviewPageQuery {
  page: number;
  pageSize: number;
}

export interface ReviewRepository {
  findByBookingId(bookingId: string): Promise<Review | null>;
  findByPropertyId(propertyId: string, page: ReviewPageQuery): Promise<Review[]>;
  countByPropertyId(propertyId: string): Promise<number>;
  findByGuestId(guestId: string, page: ReviewPageQuery): Promise<Review[]>;
  countByGuestId(guestId: string): Promise<number>;
}
