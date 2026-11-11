import { randomUUID } from 'node:crypto';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { CreatePaymentOrderWorker } from '@bookings/application/payments/create-payment-order.worker';
import { RequestRefundWorker } from '@bookings/application/payments/request-refund.worker';
import { CheckInBookingUseCase } from '@bookings/application/stay-lifecycle/check-in-booking.use-case';
import { CheckOutBookingUseCase } from '@bookings/application/stay-lifecycle/check-out-booking.use-case';
import { GetReviewEligibilityUseCase } from '@bookings/application/stay-lifecycle/get-review-eligibility.use-case';
import { VersionedCancellationPolicyAdapter } from '@bookings/infrastructure/config/versioned-cancellation-policy.adapter';
import { BookingRepository } from '@bookings/infrastructure/persistence/prisma/booking.repository';
import { PrismaCancelGuestBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/cancel-booking.unit-of-work';
import { PrismaCreateBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/create-booking.unit-of-work';
import { PaymentWorkRepository } from '@bookings/infrastructure/persistence/prisma/payment-work.repository';
import { PrismaPaymentResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/payment-result.unit-of-work';
import { PrismaRefundResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/refund-result.unit-of-work';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { PrismaStayLifecycleUnitOfWork } from '@bookings/infrastructure/persistence/prisma/stay-lifecycle.unit-of-work';

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('isolated bookings end-to-end', () => {
  let prisma: PrismaService;
  let createBooking: CreateBookingUseCase;
  let orderWorker: CreatePaymentOrderWorker;
  let paymentResult: PrismaPaymentResultUnitOfWork;
  let checkIn: CheckInBookingUseCase;
  let checkOut: CheckOutBookingUseCase;
  let eligibility: GetReviewEligibilityUseCase;
  let cancelGuest: CancelGuestBookingUseCase;
  let refundWorker: RequestRefundWorker;
  let refundResult: PrismaRefundResultUnitOfWork;
  let today = '2036-01-01';
  const guestId = randomUUID(); const ownerId = randomUUID(); const propertyId = randomUUID();
  const bookingIds: string[] = []; const processedEvents: string[] = [];
  const clock = { now: () => new Date(`${today}T12:00:00.000Z`), today: () => today };
  const quote = {
    getQuote: async (property: string, room: string) => ({
      propertyId: property, roomId: room, ownerId, propertyName: 'Property', roomName: 'Room', propertyStatus: 'PUBLISHED' as const,
      capacity: 2, basePrice: { amount: '10.00', currency: 'USD' }, propertyVersion: 1, roomUpdatedAt: '2035-01-01T00:00:00.000Z',
    }),
  };
  const payments = { createOrder: async () => ({ paymentId: randomUUID(), status: 'PENDING' as const }) };
  const refunds = { requestRefund: jest.fn(async () => ({ refundId: randomUUID(), status: 'PENDING' as const })) };

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    const repository = new BookingRepository(prisma);
    const work = new PaymentWorkRepository(prisma);
    const lifecycle = new PrismaStayLifecycleUnitOfWork(prisma);
    createBooking = new CreateBookingUseCase(quote, clock, new PrismaCreateBookingUnitOfWork(prisma), { paymentHoldMinutes: 15, cancellationPolicyVersion: 'v1' });
    orderWorker = new CreatePaymentOrderWorker(work, repository, payments);
    paymentResult = new PrismaPaymentResultUnitOfWork(prisma);
    checkIn = new CheckInBookingUseCase(repository, lifecycle, clock);
    checkOut = new CheckOutBookingUseCase(repository, lifecycle, clock);
    eligibility = new GetReviewEligibilityUseCase(repository);
    const policy = new VersionedCancellationPolicyAdapter({ cancellationPolicyVersion: 'v1', cancellationPolicy: { version: 'v1', freeCancellationBeforeHours: 48, refundPercent: 100 } } as never);
    cancelGuest = new CancelGuestBookingUseCase(repository, policy, new PrismaCancelGuestBookingUnitOfWork(prisma), clock);
    refundWorker = new RequestRefundWorker(work, repository, refunds);
    refundResult = new PrismaRefundResultUnitOfWork(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.processedEvent.deleteMany({ where: { eventId: { in: processedEvents } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: bookingIds } } });
    await prisma.notificationWork.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.paymentWork.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.cancellationDecision.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.bookingTransition.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.idempotencyRecord.deleteMany({ where: { guestId } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.$disconnect();
  });

  it('runs create → payment confirmed → check-in → check-out → review eligibility', async () => {
    const booking = await createBooking.execute({ guestId, propertyId, roomId: randomUUID(), checkIn: '2036-01-10', checkOut: '2036-01-12', guests: 1, idempotencyKey: 'e2e-key-00000001' });
    bookingIds.push(booking.id);
    expect(await orderWorker.runOnce()).toBeGreaterThanOrEqual(1);
    const paymentOrderId = (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentOrderId;
    expect(paymentOrderId).not.toBeNull();
    const confirmed = { eventId: randomUUID(), eventType: 'payment.v1.approved' as const, schemaVersion: 1 as const, occurredAt: new Date().toISOString(), paymentId: paymentOrderId!, bookingId: booking.id, payerUserId: guestId, amountMinor: 1000, currency: 'USD' };
    processedEvents.push(confirmed.eventId);
    await expect(paymentResult.apply(confirmed, 'a'.repeat(64))).resolves.toBe('APPLIED');
    today = '2036-01-10';
    await expect(checkIn.execute({ bookingId: booking.id, ownerId })).resolves.toMatchObject({ status: 'CHECKED_IN' });
    today = '2036-01-12';
    await expect(checkOut.execute({ bookingId: booking.id, ownerId })).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(eligibility.execute({ bookingId: booking.id, guestId })).resolves.toMatchObject({ eligible: true });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: booking.id, eventType: 'booking.v1.completed' } })).toBe(1);
  });

  it('runs create → payment confirmed → guest cancellation → refund completed without duplicate work', async () => {
    today = '2036-01-01';
    const booking = await createBooking.execute({ guestId, propertyId, roomId: randomUUID(), checkIn: '2036-02-10', checkOut: '2036-02-12', guests: 1, idempotencyKey: 'e2e-key-00000002' });
    bookingIds.push(booking.id);
    await orderWorker.runOnce();
    const paymentOrderId = (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentOrderId;
    expect(paymentOrderId).not.toBeNull();
    const confirmed = { eventId: randomUUID(), eventType: 'payment.v1.approved' as const, schemaVersion: 1 as const, occurredAt: new Date().toISOString(), paymentId: paymentOrderId!, bookingId: booking.id, payerUserId: guestId, amountMinor: 1000, currency: 'USD' };
    processedEvents.push(confirmed.eventId);
    await paymentResult.apply(confirmed, 'b'.repeat(64));
    await expect(cancelGuest.execute({ bookingId: booking.id, actorId: guestId })).resolves.toMatchObject({ status: 'CANCELLED_BY_GUEST' });
    expect(await prisma.paymentWork.count({ where: { bookingId: booking.id, operation: 'REQUEST_REFUND' } })).toBe(1);
    expect(await refundWorker.runOnce()).toBeGreaterThanOrEqual(1);
    const refundEventId = randomUUID();
    processedEvents.push(refundEventId);
    await refundResult.apply({ eventId: refundEventId, eventType: 'payment.v1.refunded', schemaVersion: 1, occurredAt: new Date().toISOString(), paymentId: paymentOrderId!, bookingId: booking.id, payerUserId: guestId, amountMinor: 2000, currency: 'USD', refundId: randomUUID(), refundedAmountMinor: 2000, totalRefundedAmountMinor: 2000, reason: 'GUEST_CANCELLATION', paymentStatus: 'REFUNDED' }, 'c'.repeat(64));
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.status).toBe('CANCELLED_BY_GUEST');
    expect(stored.paymentStatus).toBe('REFUNDED');
    expect(await prisma.paymentWork.count({ where: { bookingId: booking.id, operation: 'REQUEST_REFUND' } })).toBe(1);
  });
});
