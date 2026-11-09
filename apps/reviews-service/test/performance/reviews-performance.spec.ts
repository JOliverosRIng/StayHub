import { performance } from 'node:perf_hooks';
import { ListPropertyReviewsUseCase } from '@reviews/application/list-property-reviews/list-property-reviews.use-case';
import { ListOwnReviewsUseCase } from '@reviews/application/list-user-reviews/list-own-reviews.use-case';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { PrismaReviewRepository } from '@reviews/infrastructure/persistence/prisma/review.repository';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';
import { reviewsPerformanceDataset } from '../fixtures/performance-dataset';

const databaseUrl = process.env.REVIEWS_TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

function p95(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

describeDb('reviews read performance', () => {
  let prisma: PrismaService;
  let propertyReviews: ListPropertyReviewsUseCase;
  let ownReviews: ListOwnReviewsUseCase;
  const dataset = reviewsPerformanceDataset();

  beforeAll(async () => {
    prisma = new PrismaService({ databaseUrl } as ReviewsConfig);
    await prisma.$connect();
    const repository = new PrismaReviewRepository(prisma);
    propertyReviews = new ListPropertyReviewsUseCase(repository);
    ownReviews = new ListOwnReviewsUseCase(repository);
    await prisma.review.createMany({ data: dataset.rows });
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.review.deleteMany({ where: { propertyId: dataset.propertyId } });
    await prisma.$disconnect();
  });

  it('keeps property reviews p95 under 500 ms with a reproducible dataset', async () => {
    for (let warmup = 0; warmup < 5; warmup += 1) {
      await propertyReviews.execute({ propertyId: dataset.propertyId, page: 1, pageSize: 20 });
    }
    const samples: number[] = [];
    let errors = 0;
    for (let run = 0; run < 30; run += 1) {
      const started = performance.now();
      try {
        await propertyReviews.execute({
          propertyId: dataset.propertyId,
          page: 1 + (run % 5),
          pageSize: 20,
        });
      } catch {
        errors += 1;
      }
      samples.push(performance.now() - started);
    }
    expect(errors / samples.length).toBeLessThan(0.01);
    expect(p95(samples)).toBeLessThan(500);
  });

  it('keeps own history p95 under 500 ms', async () => {
    for (let warmup = 0; warmup < 5; warmup += 1) {
      await ownReviews.execute({
        principalSub: dataset.guestId,
        userId: dataset.guestId,
        page: 1,
        pageSize: 20,
      });
    }
    const samples: number[] = [];
    let errors = 0;
    for (let run = 0; run < 30; run += 1) {
      const started = performance.now();
      try {
        await ownReviews.execute({
          principalSub: dataset.guestId,
          userId: dataset.guestId,
          page: 1 + (run % 5),
          pageSize: 20,
        });
      } catch {
        errors += 1;
      }
      samples.push(performance.now() - started);
    }
    expect(errors / samples.length).toBeLessThan(0.01);
    expect(p95(samples)).toBeLessThan(500);
  });
});
