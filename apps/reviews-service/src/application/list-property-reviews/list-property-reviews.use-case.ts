import type { ReviewRepository } from '@reviews/application/ports/review.repository';
import { buildReviewPage, type ReviewPage } from '@reviews/domain/reviews/review-page';

export interface ListPropertyReviewsQuery {
  propertyId: string;
  page: number;
  pageSize: number;
}

export class ListPropertyReviewsUseCase {
  public constructor(private readonly reviews: ReviewRepository) {}

  public async execute(query: ListPropertyReviewsQuery): Promise<ReviewPage> {
    const [items, total] = await Promise.all([
      this.reviews.findByPropertyId(query.propertyId, {
        page: query.page,
        pageSize: query.pageSize,
      }),
      this.reviews.countByPropertyId(query.propertyId),
    ]);

    return buildReviewPage(items, query.page, query.pageSize, total);
  }
}
