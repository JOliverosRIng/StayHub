import { Rating } from '@reviews/domain/reviews/rating';
import { ReviewComment } from '@reviews/domain/reviews/review-comment';
import { Review } from '@reviews/domain/reviews/review';

describe('review values', () => {
  it.each([1, 2, 3, 4, 5])('accepts integer rating %s', (value) => { expect(Rating.create(value).value).toBe(value); });
  it.each([0, 6, 1.5, '5', null])('rejects invalid rating %s', (value) => { expect(() => Rating.create(value)).toThrow('INVALID_RATING'); });
  it('trims only the comment edges and preserves Unicode/content', () => { expect(ReviewComment.create('  ¡Excelente! <b>tal cual</b> 😀  ').value).toBe('¡Excelente! <b>tal cual</b> 😀'); });
  it.each(['', '   ', 'x'.repeat(2001), 12])('rejects invalid comments', (value) => { expect(() => ReviewComment.create(value)).toThrow('INVALID_COMMENT'); });
  it('creates an immutable aggregate snapshot', () => {
    const review = Review.create({ id: 'id', bookingId: 'booking', propertyId: 'property', guestId: 'guest', rating: 5, comment: ' Great ', createdAt: new Date('2030-01-01T00:00:00Z') });
    expect(review.toSnapshot()).toMatchObject({ rating: 5, comment: 'Great' }); expect(Object.isFrozen(review)).toBe(true);
  });
});
