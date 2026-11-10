import { ListPropertyReviewsUseCase } from '@reviews/application/list-property-reviews/list-property-reviews.use-case';
import type { ReviewRepository } from '@reviews/application/ports/review.repository';
import { Review } from '@reviews/domain/reviews/review';

const PROPERTY = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function review(id: string, createdAt: Date, propertyId = PROPERTY): Review {
  return Review.create({
    id,
    bookingId: id,
    propertyId,
    guestId: GUEST,
    rating: 5,
    comment: 'Muy buena',
    createdAt,
  });
}

function setup(): {
  useCase: ListPropertyReviewsUseCase;
  findByPropertyId: jest.Mock;
  countByPropertyId: jest.Mock;
} {
  const findByPropertyId = jest.fn();
  const countByPropertyId = jest.fn();
  const repository = { findByPropertyId, countByPropertyId } as unknown as ReviewRepository;
  return {
    useCase: new ListPropertyReviewsUseCase(repository),
    findByPropertyId,
    countByPropertyId,
  };
}

describe('ListPropertyReviewsUseCase', () => {
  it('returns a stable page with total and totalPages for a property', async () => {
    const { useCase, findByPropertyId, countByPropertyId } = setup();
    const items = [
      review('00000000-0000-4000-8000-000000000009', NOW),
      review('00000000-0000-4000-8000-000000000008', new Date('2025-12-31T00:00:00.000Z')),
    ];
    findByPropertyId.mockResolvedValue(items);
    countByPropertyId.mockResolvedValue(5);

    const page = await useCase.execute({ propertyId: PROPERTY, page: 2, pageSize: 2 });

    expect(findByPropertyId).toHaveBeenCalledWith(PROPERTY, { page: 2, pageSize: 2 });
    expect(countByPropertyId).toHaveBeenCalledWith(PROPERTY);
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(page.items).toHaveLength(2);
  });

  it('returns an empty valid page without failing when the property has no reviews', async () => {
    const { useCase, findByPropertyId, countByPropertyId } = setup();
    findByPropertyId.mockResolvedValue([]);
    countByPropertyId.mockResolvedValue(0);

    const page = await useCase.execute({ propertyId: PROPERTY, page: 1, pageSize: 20 });

    expect(page).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it('queries only the requested property id', async () => {
    const { useCase, findByPropertyId, countByPropertyId } = setup();
    findByPropertyId.mockResolvedValue([]);
    countByPropertyId.mockResolvedValue(0);

    await useCase.execute({ propertyId: PROPERTY, page: 1, pageSize: 10 });

    expect(findByPropertyId.mock.calls[0][0]).toBe(PROPERTY);
    expect(countByPropertyId.mock.calls[0][0]).toBe(PROPERTY);
  });
});
