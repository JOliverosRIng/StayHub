import { randomUUID } from 'node:crypto';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { RequestRefundWorker } from '@bookings/application/payments/request-refund.worker';
import { VersionedCancellationPolicyAdapter } from '@bookings/infrastructure/config/versioned-cancellation-policy.adapter';
import { BookingRepository } from '@bookings/infrastructure/persistence/prisma/booking.repository';
import { PrismaCancelGuestBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/cancel-booking.unit-of-work';
import { PaymentWorkRepository } from '@bookings/infrastructure/persistence/prisma/payment-work.repository';
import { PrismaRefundResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/refund-result.unit-of-work';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('guest cancellation', () => {
  let prisma: PrismaService;
  let useCase: CancelGuestBookingUseCase;
  let refundWorker: RequestRefundWorker;
  let refundResult: PrismaRefundResultUnitOfWork;
  const refunds = { requestRefund: jest.fn(async () => ({ refundId: randomUUID(), status: 'PENDING' as const })) };
  const guestId = randomUUID(); const ownerId = randomUUID(); const propertyId = randomUUID(); const roomId = randomUUID();
  const bookingId = randomUUID(); const paymentOrderId = randomUUID(); const overlappingBookingId = randomUUID(); const refundEventId = randomUUID();

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    const repository = new BookingRepository(prisma);
    const policy = new VersionedCancellationPolicyAdapter({ cancellationPolicyVersion: 'v1', cancellationPolicy: { version: 'v1', freeCancellationBeforeHours: 48, refundPercent: 50 } } as never);
    useCase = new CancelGuestBookingUseCase(repository, policy, new PrismaCancelGuestBookingUnitOfWork(prisma), { now: () => new Date('2035-01-01T00:00:00Z'), today: () => '2035-01-01' });
    refundWorker = new RequestRefundWorker(new PaymentWorkRepository(prisma), repository, refunds);
    refundResult = new PrismaRefundResultUnitOfWork(prisma);
    await prisma.booking.create({ data: {
      id: bookingId, guestId, ownerId, propertyId, roomId, propertyName: 'Property', roomName: 'Room', checkIn: new Date('2035-01-10T00:00:00.000Z'), checkOut: new Date('2035-01-12T00:00:00.000Z'),
      guests: 1, capacitySnapshot: 2, nightlyPriceAmount: '10.00', currency: 'USD', nights: 2, totalAmount: '20.00', accommodationVersion: 1, roomSourceUpdatedAt: new Date(),
      status: 'CONFIRMED', paymentStatus: 'CAPTURED', paymentOrderId,
    } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.processedEvent.deleteMany({ where: { eventId: refundEventId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [bookingId, overlappingBookingId] } } });
    await prisma.paymentWork.deleteMany({ where: { bookingId: { in: [bookingId, overlappingBookingId] } } });
    await prisma.cancellationDecision.deleteMany({ where: { bookingId: { in: [bookingId, overlappingBookingId] } } });
    await prisma.bookingTransition.deleteMany({ where: { bookingId: { in: [bookingId, overlappingBookingId] } } });
    await prisma.booking.deleteMany({ where: { id: { in: [bookingId, overlappingBookingId] } } });
    await prisma.$disconnect();
  });

  it('cancels atomically, records the decision, releases the interval and queues a single refund', async () => {
    const result = await useCase.execute({ bookingId, actorId: guestId });
    expect(result).toMatchObject({ status: 'CANCELLED_BY_GUEST', cancelledBy: 'GUEST', cancellationPolicyVersion: 'v1', paymentStatus: 'CAPTURED' });
    const decisions = await prisma.cancellationDecision.findMany({ where: { bookingId } });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ eligible: true, refundMode: 'POLICY', actorType: 'GUEST' });
    const work = await prisma.paymentWork.findMany({ where: { bookingId } });
    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({ operation: 'REQUEST_REFUND', status: 'PENDING' });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: bookingId, eventType: 'booking.v1.cancelled' } })).toBe(1);
    expect(await prisma.bookingTransition.count({ where: { bookingId, toStatus: 'CANCELLED_BY_GUEST' } })).toBe(1);
    await expect(prisma.booking.create({ data: {
      id: overlappingBookingId, guestId: randomUUID(), ownerId, propertyId, roomId, propertyName: 'Property', roomName: 'Room', checkIn: new Date('2035-01-10T00:00:00.000Z'), checkOut: new Date('2035-01-11T00:00:00.000Z'),
      guests: 1, capacitySnapshot: 2, nightlyPriceAmount: '10.00', currency: 'USD', nights: 1, totalAmount: '10.00', accommodationVersion: 1, roomSourceUpdatedAt: new Date(), status: 'PENDING_PAYMENT',
    } })).resolves.toBeDefined();
  });

  it('is idempotent and never queues a second refund', async () => {
    await expect(useCase.execute({ bookingId, actorId: guestId })).resolves.toMatchObject({ status: 'CANCELLED_BY_GUEST' });
    expect(await prisma.paymentWork.count({ where: { bookingId, operation: 'REQUEST_REFUND' } })).toBe(1);
  });

  it('requests the refund once and applies the refund result without reactivating availability', async () => {
    expect(await refundWorker.runOnce()).toBe(1);
    expect(refunds.requestRefund).toHaveBeenCalledWith({ bookingId, paymentOrderId, amount: '20.00', mode: 'POLICY', policyVersion: 'v1' }, `booking:${bookingId}:refund`);
    expect((await prisma.paymentWork.findFirstOrThrow({ where: { bookingId, operation: 'REQUEST_REFUND' } })).status).toBe('SUCCEEDED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).paymentStatus).toBe('REFUND_PENDING');
    expect(await refundWorker.runOnce()).toBe(0);
    const event = { eventId: refundEventId, eventType: 'payment.v1.refunded' as const, schemaVersion: 1 as const, occurredAt: new Date().toISOString(), paymentId: paymentOrderId, bookingId, payerUserId: randomUUID(), amountMinor: 2000, currency: 'USD', refundId: randomUUID(), refundedAmountMinor: 2000, totalRefundedAmountMinor: 2000, reason: 'GUEST_CANCELLATION' as const, paymentStatus: 'REFUNDED' as const };
    await expect(refundResult.apply(event, 'c'.repeat(64))).resolves.toBe('APPLIED');
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.paymentStatus).toBe('REFUNDED');
    expect(booking.status).toBe('CANCELLED_BY_GUEST');
    await expect(refundResult.apply(event, 'c'.repeat(64))).resolves.toBe('DUPLICATE');
  });
});
