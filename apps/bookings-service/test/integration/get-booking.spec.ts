import { randomUUID } from 'node:crypto';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { BookingRepository } from '@bookings/infrastructure/persistence/prisma/booking.repository';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('get booking snapshot', () => {
  let prisma: PrismaService;
  let useCase: GetBookingUseCase;
  const ids = { bookingId: randomUUID(), guestId: randomUUID(), ownerId: randomUUID(), propertyId: randomUUID(), roomId: randomUUID() };

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    useCase = new GetBookingUseCase(new BookingRepository(prisma));
    await prisma.booking.create({ data: {
      id: ids.bookingId, guestId: ids.guestId, ownerId: ids.ownerId, propertyId: ids.propertyId, roomId: ids.roomId,
      propertyName: 'Deleted Property', roomName: 'Room 1', checkIn: new Date('2031-05-01T00:00:00.000Z'), checkOut: new Date('2031-05-03T00:00:00.000Z'),
      guests: 2, capacitySnapshot: 2, nightlyPriceAmount: '12.34', currency: 'USD', nights: 2, totalAmount: '24.68',
      accommodationVersion: 7, roomSourceUpdatedAt: new Date(), status: 'CONFIRMED', paymentStatus: 'CAPTURED', holdExpiresAt: null,
    } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.booking.deleteMany({ where: { id: ids.bookingId } });
    await prisma.$disconnect();
  });

  it('reads the immutable snapshot even if the remote quote no longer exists', async () => {
    const result = await useCase.execute({ bookingId: ids.bookingId, actorId: ids.guestId, actorRole: 'GUEST' });
    expect(result.booking).toMatchObject({
      id: ids.bookingId, guestId: ids.guestId, ownerId: ids.ownerId, propertyName: 'Deleted Property', roomName: 'Room 1',
      checkIn: '2031-05-01', checkOut: '2031-05-03', nightlyPriceAmount: '12.34', totalAmount: '24.68', currency: 'USD', status: 'CONFIRMED',
    });
  });

  it('allows the snapshot owner to read the booking', async () => {
    const result = await useCase.execute({ bookingId: ids.bookingId, actorId: ids.ownerId, actorRole: 'OWNER' });
    expect(result.viewer).toEqual({ role: 'OWNER', sub: ids.ownerId });
  });

  it('does not expose the booking to an unrelated actor', async () => {
    await expect(useCase.execute({ bookingId: ids.bookingId, actorId: randomUUID(), actorRole: 'GUEST' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
