import { randomUUID } from 'node:crypto';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { PrismaReviewRepository } from '@reviews/infrastructure/persistence/prisma/review.repository';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';

const databaseUrl = process.env.REVIEWS_TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('review repository by guest', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewRepository;
  const guestId = randomUUID();
  const propertyId = randomUUID();
  const base = '00000000-0000-4000-8000-0000000000';

  beforeAll(async () => {
    prisma = new PrismaService({ databaseUrl } as ReviewsConfig);
    await prisma.$connect();
    repository = new PrismaReviewRepository(prisma);
    await prisma.review.createMany({
      data: [
        { id: `${base}21`, bookingId: `${base}31`, propertyId, guestId, rating: 3, comment: 'Primera', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: `${base}22`, bookingId: `${base}32`, propertyId, guestId, rating: 4, comment: 'Tercera', createdAt: new Date('2026-01-03T00:00:00.000Z') },
        { id: `${base}23`, bookingId: `${base}33`, propertyId, guestId, rating: 5, comment: 'Segunda', createdAt: new Date('2026-01-02T00:00:00.000Z') },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.review.deleteMany({ where: { guestId } });
    await prisma.$disconnect();
  });

  it('filters exclusively by guestId with createdAt DESC, id DESC', async () => {
    const page = await repository.findByGuestId(guestId, { page: 1, pageSize: 2 });

    expect(page.map((item) => item.id)).toEqual([`${base}22`, `${base}23`]);
    expect(page.every((item) => item.guestId === guestId)).toBe(true);
    expect(await repository.countByGuestId(guestId)).toBe(3);
  });

  it('returns the remaining page for the guest', async () => {
    const page = await repository.findByGuestId(guestId, { page: 2, pageSize: 2 });

    expect(page.map((item) => item.id)).toEqual([`${base}21`]);
  });

  it('returns an empty history for another user', async () => {
    const unknown = randomUUID();

    expect(await repository.findByGuestId(unknown, { page: 1, pageSize: 20 })).toEqual([]);
    expect(await repository.countByGuestId(unknown)).toBe(0);
  });
});
