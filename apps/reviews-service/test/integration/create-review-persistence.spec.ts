import { randomUUID } from 'node:crypto';
import { Review } from '@reviews/domain/reviews/review';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { PrismaReviewRepository } from '@reviews/infrastructure/persistence/prisma/review.repository';
import { PrismaReviewUnitOfWork } from '@reviews/infrastructure/persistence/prisma/review.unit-of-work';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';

const databaseUrl = process.env.REVIEWS_TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('review persistence', () => {
  let prisma: PrismaService;
  let unitOfWork: PrismaReviewUnitOfWork;
  let repository: PrismaReviewRepository;
  const createdIds: string[] = [];
  const propertyId = randomUUID();
  const guestId = randomUUID();

  beforeAll(async () => {
    prisma = new PrismaService({ databaseUrl } as ReviewsConfig);
    await prisma.$connect();
    unitOfWork = new PrismaReviewUnitOfWork(prisma);
    repository = new PrismaReviewRepository(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.review.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  function build(bookingId: string = randomUUID()): Review {
    return Review.create({
      id: randomUUID(),
      bookingId,
      propertyId,
      guestId,
      rating: 4,
      comment: '  Estadía correcta  ',
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });
  }

  it('inserts and maps the immutable Review aggregate in PostgreSQL', async () => {
    const review = build();
    createdIds.push(review.id);

    const stored = await unitOfWork.create(review);

    expect(stored.toSnapshot()).toEqual(review.toSnapshot());
    const found = await repository.findByBookingId(review.bookingId);
    expect(found?.toSnapshot()).toEqual(review.toSnapshot());
  });

  it('enforces bookingId uniqueness and maps the constraint without exposing SQL', async () => {
    const first = build();
    createdIds.push(first.id);
    await unitOfWork.create(first);

    const duplicate = build(first.bookingId);
    createdIds.push(duplicate.id);

    let captured: { code?: string; message: string } | undefined;
    try {
      await unitOfWork.create(duplicate);
    } catch (error) {
      captured = error as { code?: string; message: string };
    }

    expect(captured?.code).toBe('REVIEW_ALREADY_EXISTS');
    expect(captured?.message).not.toMatch(/constraint|SQL|prisma/iu);
    expect(await prisma.review.count({ where: { bookingId: first.bookingId } })).toBe(1);
  });
});
