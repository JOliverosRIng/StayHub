import { Review } from '@reviews/domain/reviews/review';
import { buildReviewPage } from '@reviews/domain/reviews/review-page';
import { presentReview, presentReviewPage } from '@reviews/interfaces/http/reviews/review.presenter';

const PROPERTY = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const BOOKING = '00000000-0000-4000-8000-000000000003';
const REVIEW_ID = '00000000-0000-4000-8000-000000000004';
const CREATED = new Date('2026-01-01T10:00:00.000Z');

function review(): Review {
  return Review.create({
    id: REVIEW_ID,
    bookingId: BOOKING,
    propertyId: PROPERTY,
    guestId: GUEST,
    rating: 4,
    comment: 'Buena',
    createdAt: CREATED,
  });
}

describe('review presenters', () => {
  it('never exposes guestId or bookingId in a single review view', () => {
    const view = presentReview(review());

    expect(view).toEqual({
      id: REVIEW_ID,
      propertyId: PROPERTY,
      rating: 4,
      comment: 'Buena',
      createdAt: CREATED.toISOString(),
    });
    expect(view).not.toHaveProperty('guestId');
    expect(view).not.toHaveProperty('bookingId');
  });

  it('presents a page with only public fields', () => {
    const page = buildReviewPage([review()], 1, 20, 1);
    const view = presentReviewPage(page);

    expect(view).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).not.toHaveProperty('guestId');
    expect(view.items[0]).not.toHaveProperty('bookingId');
  });
});
