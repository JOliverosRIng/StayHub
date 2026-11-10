import {
  CreateReviewUseCase,
  type CreateReviewCommand,
} from '@reviews/application/create-review/create-review.use-case';
import type { ClockPort } from '@reviews/application/ports/clock.port';
import type { IdGeneratorPort } from '@reviews/application/ports/id-generator.port';
import type { ReviewUnitOfWork } from '@reviews/application/ports/review.unit-of-work';
import type {
  ReviewEligibility,
  StayEligibilityPort,
} from '@reviews/application/ports/stay-eligibility.port';
import { Review } from '@reviews/domain/reviews/review';
import { DomainError } from '@reviews/domain/shared/domain-error';

const BOOKING = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const PROPERTY = '00000000-0000-4000-8000-000000000003';
const REVIEW_ID = '00000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function eligibility(overrides: Partial<ReviewEligibility> = {}): ReviewEligibility {
  return { bookingId: BOOKING, guestId: GUEST, propertyId: PROPERTY, eligible: true, ...overrides };
}

function setup(): {
  useCase: CreateReviewUseCase;
  getEligibility: jest.Mock;
  create: jest.Mock;
} {
  const getEligibility = jest.fn();
  const create = jest.fn();
  const eligibilityPort: StayEligibilityPort = { getEligibility };
  const unitOfWork: ReviewUnitOfWork = { create };
  const clock: ClockPort = { now: () => NOW };
  const ids: IdGeneratorPort = { generate: () => REVIEW_ID };
  return {
    useCase: new CreateReviewUseCase(eligibilityPort, unitOfWork, clock, ids),
    getEligibility,
    create,
  };
}

function command(overrides: Partial<CreateReviewCommand> = {}): CreateReviewCommand {
  return {
    bookingId: BOOKING,
    rating: 5,
    comment: '  Excelente estadía  ',
    guestId: GUEST,
    role: 'GUEST',
    traceId: 'trace-0001',
    ...overrides,
  };
}

describe('CreateReviewUseCase', () => {
  it('creates one review when Bookings confirms matching eligibility', async () => {
    const { useCase, getEligibility, create } = setup();
    getEligibility.mockResolvedValue(eligibility());
    create.mockImplementation(async (review: Review) => review);

    const review = await useCase.execute(command());

    expect(getEligibility).toHaveBeenCalledWith(BOOKING, GUEST, 'trace-0001');
    expect(create).toHaveBeenCalledTimes(1);
    expect(review.toSnapshot()).toMatchObject({
      id: REVIEW_ID,
      bookingId: BOOKING,
      propertyId: PROPERTY,
      guestId: GUEST,
      rating: 5,
      comment: 'Excelente estadía',
      createdAt: NOW,
    });
  });

  it('rejects eligible=false and mismatched booking or guest identifiers', async () => {
    const { useCase, getEligibility, create } = setup();

    getEligibility.mockResolvedValueOnce(eligibility({ eligible: false }));
    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'BOOKING_NOT_ELIGIBLE',
    });

    getEligibility.mockResolvedValueOnce(eligibility({ guestId: '00000000-0000-4000-8000-000000000099' }));
    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'BOOKING_NOT_ELIGIBLE',
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects principals whose role is not GUEST before persistence', async () => {
    const { useCase, getEligibility, create } = setup();

    await expect(useCase.execute(command({ role: 'OWNER' }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const withoutRole: CreateReviewCommand = {
      bookingId: BOOKING,
      rating: 5,
      comment: 'ok',
      guestId: GUEST,
      traceId: 'trace-0001',
    };
    await expect(useCase.execute(withoutRole)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(getEligibility).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects invalid ratings and comments before calling Bookings', async () => {
    const { useCase, getEligibility } = setup();

    await expect(useCase.execute(command({ rating: 0 }))).rejects.toMatchObject({
      code: 'INVALID_RATING',
    });
    await expect(useCase.execute(command({ rating: 6 }))).rejects.toMatchObject({
      code: 'INVALID_RATING',
    });
    await expect(useCase.execute(command({ comment: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_COMMENT',
    });

    expect(getEligibility).not.toHaveBeenCalled();
  });

  it('maps duplicate bookingId to REVIEW_ALREADY_EXISTS', async () => {
    const { useCase, getEligibility, create } = setup();
    getEligibility.mockResolvedValue(eligibility());
    create.mockRejectedValue(new DomainError('REVIEW_ALREADY_EXISTS'));

    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'REVIEW_ALREADY_EXISTS',
    });
  });

  it('fails closed when Bookings is unavailable', async () => {
    const { useCase, getEligibility, create } = setup();
    getEligibility.mockRejectedValue(new DomainError('DEPENDENCY_UNAVAILABLE'));

    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    expect(create).not.toHaveBeenCalled();
  });
});
