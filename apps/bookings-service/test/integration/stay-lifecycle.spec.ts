import { randomUUID } from 'node:crypto';
import { CheckInBookingUseCase } from '@bookings/application/stay-lifecycle/check-in-booking.use-case';
import { CheckOutBookingUseCase } from '@bookings/application/stay-lifecycle/check-out-booking.use-case';
import { GetReviewEligibilityUseCase } from '@bookings/application/stay-lifecycle/get-review-eligibility.use-case';
import { BookingRepository } from '@bookings/infrastructure/persistence/prisma/booking.repository';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { PrismaStayLifecycleUnitOfWork } from '@bookings/infrastructure/persistence/prisma/stay-lifecycle.unit-of-work';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('stay lifecycle', () => {
  let prisma: PrismaService;
  let checkIn: CheckInBookingUseCase;
  let checkOut: CheckOutBookingUseCase;
  let eligibility: GetReviewEligibilityUseCase;
  let today = '2035-06-01';
  const ownerId = randomUUID(); const guestId = randomUUID(); const otherGuestId = randomUUID(); const bookingId = randomUUID();
  const propertyId = randomUUID(); const roomId = randomUUID();
  const clock = { now: () => new Date(`${today}T12:00:00.000Z`), today: () => today };

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    const repository = new BookingRepository(prisma);
    const uow = new PrismaStayLifecycleUnitOfWork(prisma);
    checkIn = new CheckInBookingUseCase(repository, uow, clock);
    checkOut = new CheckOutBookingUseCase(repository, uow, clock);
    eligibility = new GetReviewEligibilityUseCase(repository);
    await prisma.booking.create({ data: {
      id: bookingId, guestId, ownerId, propertyId, roomId, propertyName: 'Property', roomName: 'Room', checkIn: new Date('2035-06-01T00:00:00.000Z'), checkOut: new Date('2035-06-03T00:00:00.000Z'),
      guests: 1, capacitySnapshot: 2, nightlyPriceAmount: '10.00', currency: 'USD', nights: 2, totalAmount: '20.00', accommodationVersion: 1, roomSourceUpdatedAt: new Date(),
      status: 'CONFIRMED', paymentStatus: 'CAPTURED',
    } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: bookingId } });
    await prisma.bookingTransition.deleteMany({ where: { bookingId } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
    await prisma.$disconnect();
  });

  it('does not let a foreign owner check in', async () => {
    await expect(checkIn.execute({ bookingId, ownerId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('checks in, records the transition and keeps eligibility negative before completion', async () => {
    const result = await checkIn.execute({ bookingId, ownerId });
    expect(result).toMatchObject({ status: 'CHECKED_IN', ownerId, guestId });
    expect(result.checkedInAt).not.toBeNull();
    expect(await prisma.bookingTransition.count({ where: { bookingId, toStatus: 'CHECKED_IN' } })).toBe(1);
    await expect(eligibility.execute({ bookingId, guestId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(checkIn.execute({ bookingId, ownerId })).resolves.toMatchObject({ status: 'CHECKED_IN' });
    expect(await prisma.bookingTransition.count({ where: { bookingId, toStatus: 'CHECKED_IN' } })).toBe(1);
  });

  it('completes the stay and publishes the minimal completed event in the same unit of work', async () => {
    today = '2035-06-03';
    const result = await checkOut.execute({ bookingId, ownerId });
    expect(result).toMatchObject({ status: 'COMPLETED', checkedOutAt: expect.any(String) });
    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: bookingId, eventType: 'booking.v1.completed' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ bookingId, guestId, propertyId });
    await expect(checkOut.execute({ bookingId, ownerId })).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: bookingId, eventType: 'booking.v1.completed' } })).toBe(1);
  });

  it('grants eligibility only to the matching guest after completion', async () => {
    await expect(eligibility.execute({ bookingId, guestId })).resolves.toEqual({ bookingId, guestId, propertyId, eligible: true });
    await expect(eligibility.execute({ bookingId, guestId: otherGuestId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
