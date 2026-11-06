import { performance } from 'node:perf_hooks';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { BookingRepository } from '@bookings/infrastructure/persistence/prisma/booking.repository';
import { PrismaOwnerBookingHistoryQuery } from '@bookings/infrastructure/persistence/prisma/owner-booking-history.query';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { performanceDataset } from '../fixtures/performance-dataset';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

function p95(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

describeDb('bookings read performance', () => {
  let prisma: PrismaService;
  let history: GetOwnerBookingHistoryUseCase;
  let repository: BookingRepository;
  const dataset = performanceDataset();

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    history = new GetOwnerBookingHistoryUseCase(new PrismaOwnerBookingHistoryQuery(prisma));
    repository = new BookingRepository(prisma);
    await prisma.booking.createMany({ data: dataset.rows as never });
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.booking.deleteMany({ where: { ownerId: dataset.ownerId } });
    await prisma.$disconnect();
  });

  it('keeps owner history p95 under 500 ms with a reproducible dataset', async () => {
    for (let warmup = 0; warmup < 5; warmup += 1) await history.execute({ ownerId: dataset.ownerId, page: 1, pageSize: 20 });
    const samples: number[] = [];
    for (let run = 0; run < 30; run += 1) {
      const started = performance.now();
      await history.execute({ ownerId: dataset.ownerId, page: 1 + (run % 5), pageSize: 20, status: 'CONFIRMED' });
      samples.push(performance.now() - started);
    }
    expect(p95(samples)).toBeLessThan(500);
  });

  it('keeps booking detail p95 under 500 ms', async () => {
    for (let warmup = 0; warmup < 5; warmup += 1) await repository.findById(dataset.detailBookingId);
    const samples: number[] = [];
    for (let run = 0; run < 50; run += 1) {
      const started = performance.now();
      await repository.findById(dataset.detailBookingId);
      samples.push(performance.now() - started);
    }
    expect(p95(samples)).toBeLessThan(500);
  });
});
