import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@bookings/infrastructure/persistence/generated/client';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;
describeDb('PostgreSQL booking overlap', () => {
  let prisma: PrismaClient;
  const roomId = randomUUID();
  beforeAll(() => { prisma = new PrismaClient({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } }); });
  const data = (checkIn: string, checkOut: string) => ({ id: randomUUID(), guestId: randomUUID(), ownerId: randomUUID(), propertyId: randomUUID(), roomId, propertyName: 'Property', roomName: 'Room', checkIn: new Date(`${checkIn}T00:00:00Z`), checkOut: new Date(`${checkOut}T00:00:00Z`), guests: 1, capacitySnapshot: 2, nightlyPriceAmount: '10.00', currency: 'USD', nights: Math.round((Date.parse(checkOut)-Date.parse(checkIn))/86400000), totalAmount: '10.00', accommodationVersion: 1, roomSourceUpdatedAt: new Date(), status: 'PENDING_PAYMENT' as const, holdExpiresAt: new Date(Date.now()+60000) });
  afterAll(async()=>{if(!prisma)return;await prisma.booking.deleteMany({where:{roomId}});await prisma.$disconnect();});
  it('allows exactly one concurrent overlapping hold',async()=>{const results=await Promise.allSettled([prisma.booking.create({data:data('2030-01-01','2030-01-03')}),prisma.booking.create({data:data('2030-01-02','2030-01-04')})]);expect(results.filter((r)=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter((r)=>r.status==='rejected')).toHaveLength(1);});
  it('allows contiguous intervals',async()=>{await expect(Promise.all([prisma.booking.create({data:data('2030-02-01','2030-02-02')}),prisma.booking.create({data:data('2030-02-02','2030-02-03')})])).resolves.toHaveLength(2);});
});
