import { randomUUID } from 'node:crypto';
import { Review } from '@reviews/domain/reviews/review';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { PrismaReviewUnitOfWork } from '@reviews/infrastructure/persistence/prisma/review.unit-of-work';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';

const databaseUrl = process.env.REVIEWS_TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('review booking uniqueness', () => {
  let prisma: PrismaService;
  let unitOfWork: PrismaReviewUnitOfWork;
  const createdIds: string[] = [];
  const propertyId = randomUUID();
  const guestId = randomUUID();

  beforeAll(async () => {
    prisma = new PrismaService({ databaseUrl } as ReviewsConfig);
    await prisma.$connect();
    unitOfWork = new PrismaReviewUnitOfWork(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.review.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  function build(bookingId: string): Review {
    return Review.create({
      id: randomUUID(),
      bookingId,
      propertyId,
      guestId,
      rating: 5,
      comment: 'Concurrent review',
      createdAt: new Date(),
    });
  }

  it('allows exactly one of two simultaneous inserts for the same bookingId', async () => {
    const bookingId = randomUUID();
    const first = build(bookingId);
    const second = build(bookingId);
    createdIds.push(first.id, second.id);

    const settled = await Promise.allSettled([
      unitOfWork.create(first),
      unitOfWork.create(second),
    ]);
    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<Review> => result.status === 'fulfilled',
    );
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0]?.reason as { code?: string }).code).toBe('REVIEW_ALREADY_EXISTS');
    expect(await prisma.review.count({ where: { bookingId } })).toBe(1);
  });
});
