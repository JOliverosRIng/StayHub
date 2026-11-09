import type { ReviewRepository } from '@reviews/application/ports/review.repository';
import { assertReviewOwnership } from '@reviews/domain/reviews/review-ownership.policy';
import { buildReviewPage, type ReviewPage } from '@reviews/domain/reviews/review-page';

export interface ListOwnReviewsQuery {
  principalSub: string;
  userId: string;
  page: number;
  pageSize: number;
}

export class ListOwnReviewsUseCase {
  public constructor(private readonly reviews: ReviewRepository) {}

  public async execute(query: ListOwnReviewsQuery): Promise<ReviewPage> {
    assertReviewOwnership(query.principalSub, query.userId);

    const [items, total] = await Promise.all([
      this.reviews.findByGuestId(query.userId, { page: query.page, pageSize: query.pageSize }),
      this.reviews.countByGuestId(query.userId),
    ]);

    return buildReviewPage(items, query.page, query.pageSize, total);
  }
}
