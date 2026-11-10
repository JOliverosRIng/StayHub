import { randomUUID } from 'node:crypto';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { NotificationWorkRepository } from '@bookings/infrastructure/persistence/prisma/notification-work.repository';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('NotificationWork repository', () => {
  let prisma: PrismaService;
  let repository: NotificationWorkRepository;
  const bookingIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    repository = new NotificationWorkRepository(prisma, { notificationRetryBaseMs: 1000, notificationWorkLeaseMs: 300_000 } as never);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.notificationWork.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.$disconnect();
  });

  const createWork = async (): Promise<{ id: string; bookingId: string }> => {
    const bookingId = randomUUID();
    bookingIds.push(bookingId);
    await prisma.booking.create({ data: {
      id: bookingId, guestId: randomUUID(), ownerId: randomUUID(), propertyId: randomUUID(), roomId: randomUUID(),
      propertyName: 'P', roomName: 'R', checkIn: new Date('2032-01-01'), checkOut: new Date('2032-01-02'),
      guests: 1, capacitySnapshot: 1, nightlyPriceAmount: '10.00', currency: 'USD', nights: 1, totalAmount: '10.00',
      accommodationVersion: 1, roomSourceUpdatedAt: new Date(), status: 'CONFIRMED', paymentStatus: 'CAPTURED',
    } });
    const id = randomUUID();
    await prisma.notificationWork.create({ data: { id, bookingId, operation: 'BOOKING_CONFIRMED', status: 'PENDING', nextAttemptAt: new Date(Date.now() - 1_000) } });
    return { id, bookingId };
  };

  it('claims a due work item atomically and increments its attempts', async () => {
    const work = await createWork();
    const claimed = await repository.claim(10);
    expect(claimed).toEqual(expect.arrayContaining([expect.objectContaining({ id: work.id, bookingId: work.bookingId, attempts: 1 })]));
    const stored = await prisma.notificationWork.findUniqueOrThrow({ where: { id: work.id } });
    expect(stored).toMatchObject({ status: 'IN_FLIGHT', attempts: 1 });
  });

  it('does not claim a retry before its next attempt and reclaims stale in-flight work', async () => {
    const work = await createWork();
    await repository.claim(10);
    await repository.retry(work.id, 1, 'NOTIFICATIONS_UNAVAILABLE');
    expect(await repository.claim(10)).toEqual([]);
    await prisma.notificationWork.update({ where: { id: work.id }, data: { status: 'IN_FLIGHT', updatedAt: new Date(Date.now() - 600_000) } });
    expect(await repository.claim(10)).toEqual(expect.arrayContaining([expect.objectContaining({ id: work.id, attempts: 2 })]));
  });

  it('records success and dead outcomes with a safe error code', async () => {
    const succeeded = await createWork();
    await repository.claim(10);
    await repository.succeeded(succeeded.id);
    expect(await prisma.notificationWork.findUniqueOrThrow({ where: { id: succeeded.id } })).toMatchObject({ status: 'SUCCEEDED', lastErrorCode: null });

    const dead = await createWork();
    await repository.claim(10);
    await repository.dead(dead.id, 'NOTIFICATIONS_CONFLICT');
    expect(await prisma.notificationWork.findUniqueOrThrow({ where: { id: dead.id } })).toMatchObject({ status: 'DEAD', lastErrorCode: 'NOTIFICATIONS_CONFLICT' });
  });
});
