import type { Review } from '@reviews/domain/reviews/review';
import type { ReviewPage } from '@reviews/domain/reviews/review-page';
import { ReviewPageDto, type ReviewItemDto } from '@reviews/interfaces/http/dto/review-page.dto';

export interface ReviewView {
  id: string;
  propertyId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export function presentReview(review: Review): ReviewView {
  const snapshot = review.toSnapshot();
  return {
    id: snapshot.id,
    propertyId: snapshot.propertyId,
    rating: snapshot.rating,
    comment: snapshot.comment,
    createdAt: snapshot.createdAt.toISOString(),
  };
}

export function presentReviewPage(page: ReviewPage): ReviewPageDto {
  const result = new ReviewPageDto();
  result.items = page.items.map((review): ReviewItemDto => presentReview(review));
  result.page = page.page;
  result.pageSize = page.pageSize;
  result.total = page.total;
  result.totalPages = page.totalPages;
  return result;
}
