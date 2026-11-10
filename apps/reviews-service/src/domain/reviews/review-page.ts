import type { Review } from './review';

export interface ReviewPage {
  items: Review[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildReviewPage(
  items: Review[],
  page: number,
  pageSize: number,
  total: number,
): ReviewPage {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
