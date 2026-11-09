import { randomUUID } from 'node:crypto';
import { CreateReviewUseCase } from '@reviews/application/create-review/create-review.use-case';
import { ListPropertyReviewsUseCase } from '@reviews/application/list-property-reviews/list-property-reviews.use-case';
import { ListOwnReviewsUseCase } from '@reviews/application/list-user-reviews/list-own-reviews.use-case';
import type {
  ReviewEligibility,
  StayEligibilityPort,
} from '@reviews/application/ports/stay-eligibility.port';
import { DomainError } from '@reviews/domain/shared/domain-error';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { PrismaReviewRepository } from '@reviews/infrastructure/persistence/prisma/review.repository';
import { PrismaReviewUnitOfWork } from '@reviews/infrastructure/persistence/prisma/review.unit-of-work';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';

const databaseUrl = process.env.REVIEWS_TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('isolated reviews end-to-end', () => {
  let prisma: PrismaService;
  let createReview: CreateReviewUseCase;
  let propertyReviews: ListPropertyReviewsUseCase;
  let ownReviews: ListOwnReviewsUseCase;
  const guestId = randomUUID();
  const otherGuestId = randomUUID();
  const propertyId = randomUUID();
  const completedBooking = randomUUID();
  const pendingBooking = randomUUID();
  const failingBooking = randomUUID();
  const createdBookingIds: string[] = [];

  const eligibility: StayEligibilityPort = {
    getEligibility: async (bookingId: string, guest: string): Promise<ReviewEligibility> => {
      if (bookingId === failingBooking) throw new DomainError('DEPENDENCY_UNAVAILABLE');
      const eligible = bookingId === completedBooking && guest === guestId;
      return { bookingId, guestId: guest, propertyId, eligible };
    },
  };

  beforeAll(async () => {
    prisma = new PrismaService({ databaseUrl } as ReviewsConfig);
    await prisma.$connect();
    const repository = new PrismaReviewRepository(prisma);
    createReview = new CreateReviewUseCase(
      eligibility,
      new PrismaReviewUnitOfWork(prisma),
      { now: () => new Date('2026-01-01T00:00:00.000Z') },
      { generate: () => randomUUID() },
    );
    propertyReviews = new ListPropertyReviewsUseCase(repository);
    ownReviews = new ListOwnReviewsUseCase(repository);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.review.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await prisma.$disconnect();
  });

  it('creates, rejects duplicates and queries through the public use cases', async () => {
    createdBookingIds.push(completedBooking);

    const created = await createReview.execute({
      bookingId: completedBooking,
      rating: 5,
      comment: '  Estadía perfecta  ',
      guestId,
      role: 'GUEST',
      traceId: 'trace-e2e',
    });
    expect(created.toSnapshot()).toMatchObject({
      bookingId: completedBooking,
      propertyId,
      guestId,
      rating: 5,
      comment: 'Estadía perfecta',
    });

    await expect(
      createReview.execute({
        bookingId: completedBooking,
        rating: 4,
        comment: 'Duplicada',
        guestId,
        role: 'GUEST',
        traceId: 'trace-e2e',
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_ALREADY_EXISTS' });

    const propertyPage = await propertyReviews.execute({ propertyId, page: 1, pageSize: 20 });
    expect(propertyPage.total).toBe(1);
    expect(propertyPage.items[0]?.bookingId).toBe(completedBooking);

    const ownPage = await ownReviews.execute({
      principalSub: guestId,
      userId: guestId,
      page: 1,
      pageSize: 20,
    });
    expect(ownPage.total).toBe(1);

    await expect(
      ownReviews.execute({
        principalSub: otherGuestId,
        userId: guestId,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fails closed for non-eligible stays and unavailable dependencies', async () => {
    createdBookingIds.push(pendingBooking, failingBooking);

    await expect(
      createReview.execute({
        bookingId: pendingBooking,
        rating: 5,
        comment: 'No elegible',
        guestId,
        role: 'GUEST',
        traceId: 'trace-e2e',
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_NOT_ELIGIBLE' });

    await expect(
      createReview.execute({
        bookingId: failingBooking,
        rating: 5,
        comment: 'Dependencia caída',
        guestId,
        role: 'GUEST',
        traceId: 'trace-e2e',
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });

    expect(
      await prisma.review.count({ where: { bookingId: { in: [pendingBooking, failingBooking] } } }),
    ).toBe(0);
  });
});
