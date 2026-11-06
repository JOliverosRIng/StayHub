import { randomUUID } from 'node:crypto';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { PrismaCreateBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/create-booking.unit-of-work';
import { Booking } from '@bookings/domain/bookings/booking';
import { StayPeriod } from '@bookings/domain/bookings/stay-period';
import { Money } from '@bookings/domain/money/money';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('create idempotency', () => {
  const prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
  const uow = new PrismaCreateBookingUnitOfWork(prisma);
  const guestId = randomUUID();
  const make = () => new Booking({ guestId, guests: 1, period: StayPeriod.create('2031-01-01','2031-01-02'), nightlyPrice: Money.parse('10.00','USD'), snapshot: { propertyId: randomUUID(), roomId: randomUUID(), ownerId: randomUUID(), propertyName: 'P', roomName: 'R', capacity: 1, propertyVersion: 1, roomUpdatedAt: new Date() }, holdExpiresAt: new Date(Date.now()+60000) });

  afterAll(async () => {
    const ids = (await prisma.booking.findMany({ where: { guestId }, select: { id: true } })).map((row) => row.id);
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
    await prisma.paymentWork.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.idempotencyRecord.deleteMany({ where: { guestId } });
    await prisma.bookingTransition.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { guestId } });
    await prisma.$disconnect();
  });

  it('replays the same key/hash and rejects a different hash', async () => {
    const first = await uow.create({ booking: make(), idempotencyKey: 'same-key-0000001', requestHash: 'a'.repeat(64) });
    const replay = await uow.create({ booking: make(), idempotencyKey: 'same-key-0000001', requestHash: 'a'.repeat(64) });
    expect(replay.id).toBe(first.id);
    await expect(uow.create({ booking: make(), idempotencyKey: 'same-key-0000001', requestHash: 'b'.repeat(64) })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
});
