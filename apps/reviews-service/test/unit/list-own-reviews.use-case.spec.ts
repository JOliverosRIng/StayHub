import { ListOwnReviewsUseCase } from '@reviews/application/list-user-reviews/list-own-reviews.use-case';
import type { ReviewRepository } from '@reviews/application/ports/review.repository';
import { Review } from '@reviews/domain/reviews/review';

const GUEST = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const PROPERTY = '00000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function review(id: string, guestId = GUEST): Review {
  return Review.create({
    id,
    bookingId: id,
    propertyId: PROPERTY,
    guestId,
    rating: 5,
    comment: 'Muy buena',
    createdAt: NOW,
  });
}

function setup(): {
  useCase: ListOwnReviewsUseCase;
  findByGuestId: jest.Mock;
  countByGuestId: jest.Mock;
} {
  const findByGuestId = jest.fn();
  const countByGuestId = jest.fn();
  const repository = { findByGuestId, countByGuestId } as unknown as ReviewRepository;
  return {
    useCase: new ListOwnReviewsUseCase(repository),
    findByGuestId,
    countByGuestId,
  };
}

describe('ListOwnReviewsUseCase', () => {
  it('lists only the authenticated user own reviews with stable pagination', async () => {
    const { useCase, findByGuestId, countByGuestId } = setup();
    findByGuestId.mockResolvedValue([
      review('00000000-0000-4000-8000-000000000011'),
      review('00000000-0000-4000-8000-000000000012'),
    ]);
    countByGuestId.mockResolvedValue(7);

    const page = await useCase.execute({
      principalSub: GUEST,
      userId: GUEST,
      page: 2,
      pageSize: 2,
    });

    expect(findByGuestId).toHaveBeenCalledWith(GUEST, { page: 2, pageSize: 2 });
    expect(countByGuestId).toHaveBeenCalledWith(GUEST);
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 7, totalPages: 4 });
    expect(page.items.every((item) => item.guestId === GUEST)).toBe(true);
  });

  it('rejects another user history before touching the repository', async () => {
    const { useCase, findByGuestId, countByGuestId } = setup();

    await expect(
      useCase.execute({ principalSub: GUEST, userId: OTHER, page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(findByGuestId).not.toHaveBeenCalled();
    expect(countByGuestId).not.toHaveBeenCalled();
  });

  it('returns an empty page for a user without reviews', async () => {
    const { useCase, findByGuestId, countByGuestId } = setup();
    findByGuestId.mockResolvedValue([]);
    countByGuestId.mockResolvedValue(0);

    await expect(
      useCase.execute({ principalSub: GUEST, userId: GUEST, page: 1, pageSize: 20 }),
    ).resolves.toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });
});
