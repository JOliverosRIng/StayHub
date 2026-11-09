import { randomUUID } from 'node:crypto';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { PrismaReviewRepository } from '@reviews/infrastructure/persistence/prisma/review.repository';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';

const databaseUrl = process.env.REVIEWS_TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('review repository by property', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewRepository;
  const propertyId = randomUUID();
  const guestId = randomUUID();

  const base = '00000000-0000-4000-8000-0000000000';

  beforeAll(async () => {
    prisma = new PrismaService({ databaseUrl } as ReviewsConfig);
    await prisma.$connect();
    repository = new PrismaReviewRepository(prisma);
    await prisma.review.createMany({
      data: [
        { id: `${base}01`, bookingId: `${base}11`, propertyId, guestId, rating: 3, comment: 'Antigua', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: `${base}02`, bookingId: `${base}12`, propertyId, guestId, rating: 4, comment: 'Reciente', createdAt: new Date('2026-01-03T00:00:00.000Z') },
        { id: `${base}03`, bookingId: `${base}13`, propertyId, guestId, rating: 5, comment: 'Media', createdAt: new Date('2026-01-02T00:00:00.000Z') },
        { id: `${base}04`, bookingId: `${base}14`, propertyId, guestId, rating: 5, comment: 'Empate', createdAt: new Date('2026-01-03T00:00:00.000Z') },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.review.deleteMany({ where: { propertyId } });
    await prisma.$disconnect();
  });

  it('filters exclusively by propertyId with createdAt DESC, id DESC and total', async () => {
    const page = await repository.findByPropertyId(propertyId, { page: 1, pageSize: 2 });

    expect(page.map((item) => item.id)).toEqual([`${base}04`, `${base}02`]);
    expect(page.every((item) => item.propertyId === propertyId)).toBe(true);
    expect(await repository.countByPropertyId(propertyId)).toBe(4);
  });

  it('returns the second page with the remaining rows', async () => {
    const page = await repository.findByPropertyId(propertyId, { page: 2, pageSize: 2 });

    expect(page.map((item) => item.id)).toEqual([`${base}03`, `${base}01`]);
  });

  it('returns an empty list and zero count for an unknown property', async () => {
    const unknown = randomUUID();

    expect(await repository.findByPropertyId(unknown, { page: 1, pageSize: 20 })).toEqual([]);
    expect(await repository.countByPropertyId(unknown)).toBe(0);
  });
});
