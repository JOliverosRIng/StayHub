import { randomUUID } from 'node:crypto';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { PrismaOwnerBookingHistoryQuery } from '@bookings/infrastructure/persistence/prisma/owner-booking-history.query';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('owner booking history', () => {
  let prisma: PrismaService;
  let useCase: GetOwnerBookingHistoryUseCase;
  const ownerA = randomUUID(); const ownerB = randomUUID(); const guestX = randomUUID(); const guestY = randomUUID(); const propertyId = randomUUID();
  const ids = { a1: randomUUID(), a2: randomUUID(), a3: randomUUID(), b1: randomUUID() };

  const booking = (id: string, ownerId: string, guestId: string, status: 'CONFIRMED' | 'PENDING_PAYMENT' | 'CANCELLED_BY_GUEST', checkIn: string, checkOut: string, createdAt: string) => ({
    id, guestId, ownerId, propertyId, roomId: randomUUID(), propertyName: 'Property', roomName: 'Room',
    checkIn: new Date(`${checkIn}T00:00:00.000Z`), checkOut: new Date(`${checkOut}T00:00:00.000Z`), guests: 1, capacitySnapshot: 2,
    nightlyPriceAmount: '10.00', currency: 'USD', nights: Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000), totalAmount: '20.00',
    accommodationVersion: 1, roomSourceUpdatedAt: new Date(), status, paymentStatus: 'PENDING' as const, createdAt: new Date(createdAt),
  });

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    useCase = new GetOwnerBookingHistoryUseCase(new PrismaOwnerBookingHistoryQuery(prisma));
    await prisma.booking.createMany({ data: [
      booking(ids.a1, ownerA, guestX, 'CONFIRMED', '2033-01-10', '2033-01-12', '2033-01-01T10:00:00.000Z'),
      booking(ids.a2, ownerA, guestY, 'CANCELLED_BY_GUEST', '2033-02-10', '2033-02-12', '2033-02-01T10:00:00.000Z'),
      booking(ids.a3, ownerA, guestX, 'PENDING_PAYMENT', '2033-03-01', '2033-03-03', '2033-03-01T10:00:00.000Z'),
      booking(ids.b1, ownerB, guestX, 'CONFIRMED', '2033-01-10', '2033-01-12', '2033-01-01T10:00:00.000Z'),
    ] });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.booking.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it('returns only the owner rows in deterministic createdAt DESC, id DESC order', async () => {
    const page = await useCase.execute({ ownerId: ownerA, page: 1, pageSize: 20 });
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual([ids.a3, ids.a2, ids.a1]);
    expect(page.items.every((item) => item.ownerId === ownerA)).toBe(true);
  });

  it('paginates with hasNext and a stable boundary', async () => {
    const first = await useCase.execute({ ownerId: ownerA, page: 1, pageSize: 2 });
    const second = await useCase.execute({ ownerId: ownerA, page: 2, pageSize: 2 });
    expect(first.items.map((item) => item.id)).toEqual([ids.a3, ids.a2]);
    expect(first.hasNext).toBe(true);
    expect(second.items.map((item) => item.id)).toEqual([ids.a1]);
    expect(second.hasNext).toBe(false);
  });

  it('filters by guest and status inside the owner scope', async () => {
    expect((await useCase.execute({ ownerId: ownerA, guestId: guestX, page: 1, pageSize: 20 })).items.map((item) => item.id)).toEqual([ids.a3, ids.a1]);
    expect((await useCase.execute({ ownerId: ownerA, status: 'PENDING_PAYMENT', page: 1, pageSize: 20 })).items.map((item) => item.id)).toEqual([ids.a3]);
  });

  it('filters by date overlap', async () => {
    const page = await useCase.execute({ ownerId: ownerA, from: '2033-03-02', to: '2033-03-04', page: 1, pageSize: 20 });
    expect(page.items.map((item) => item.id)).toEqual([ids.a3]);
  });

  it('isolates rows between owners', async () => {
    const page = await useCase.execute({ ownerId: ownerB, page: 1, pageSize: 20 });
    expect(page.items.map((item) => item.id)).toEqual([ids.b1]);
    expect(await useCase.execute({ ownerId: randomUUID(), page: 1, pageSize: 20 })).toMatchObject({ total: 0, hasNext: false, items: [] });
  });
});
