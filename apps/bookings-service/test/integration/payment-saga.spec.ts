import { randomUUID } from 'node:crypto';
import type { BookingStatus, PaymentStatus } from '@bookings/infrastructure/persistence/generated/client';
import { CreatePaymentOrderWorker } from '@bookings/application/payments/create-payment-order.worker';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { PrismaPaymentResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/payment-result.unit-of-work';
import { PrismaRefundResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/refund-result.unit-of-work';
import { PaymentHoldExpiryRepository } from '@bookings/infrastructure/persistence/prisma/payment-hold-expiry.repository';

describe('payment worker', () => {
  it('marks a successful order', async () => {
    const work = { claim: jest.fn().mockResolvedValue([{ id: 'w', bookingId: 'b', idempotencyKey: 'booking:b:payment-order', amount: '20.00', currency: 'USD', attempts: 1 }]), succeeded: jest.fn(), retry: jest.fn() };
    const bookings = { findById: jest.fn().mockResolvedValue({ id: 'b', guestId: 'g' }) };
    const payments = { createOrder: jest.fn().mockResolvedValue({ paymentId: 'p', status: 'PENDING' }) };
    const worker = new CreatePaymentOrderWorker(work, bookings as never, payments);
    expect(await worker.runOnce()).toBe(1);
    expect(work.succeeded).toHaveBeenCalledWith('w', 'p');
    expect(work.retry).not.toHaveBeenCalled();
  });
  it('returns failures to retry without duplicating the claim', async () => {
    const work = { claim: jest.fn().mockResolvedValue([{ id: 'w', bookingId: 'b', idempotencyKey: 'key', amount: '20.00', currency: 'USD', attempts: 2 }]), succeeded: jest.fn(), retry: jest.fn() };
    const worker = new CreatePaymentOrderWorker(work, { findById: jest.fn().mockResolvedValue({ id: 'b', guestId: 'g' }) } as never, { createOrder: jest.fn().mockRejectedValue(new Error('timeout')) });
    await worker.runOnce();
    expect(work.retry).toHaveBeenCalledWith('w', 2, 'timeout');
  });
});

const enabled = Boolean(process.env.BOOKINGS_TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('payment result and expiration saga', () => {
  let prisma: PrismaService;
  let paymentResults: PrismaPaymentResultUnitOfWork;
  let refundResults: PrismaRefundResultUnitOfWork;
  let expiry: PaymentHoldExpiryRepository;
  const bookingIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaService({ datasources: { db: { url: process.env.BOOKINGS_TEST_DATABASE_URL! } } });
    paymentResults = new PrismaPaymentResultUnitOfWork(prisma);
    refundResults = new PrismaRefundResultUnitOfWork(prisma);
    expiry = new PaymentHoldExpiryRepository(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.processedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.notificationWork.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: bookingIds } } });
    await prisma.bookingTransition.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.$disconnect();
  });

  const create = async (status: BookingStatus = 'PENDING_PAYMENT', paymentStatus: PaymentStatus = 'PENDING', holdExpiresAt: Date | null = new Date(Date.now() + 60_000), paymentOrderId = randomUUID()): Promise<{ id: string; paymentOrderId: string }> => {
    const id = randomUUID();
    bookingIds.push(id);
    await prisma.booking.create({ data: {
      id, guestId: randomUUID(), ownerId: randomUUID(), propertyId: randomUUID(), roomId: randomUUID(),
      propertyName: 'P', roomName: 'R', checkIn: new Date('2032-01-01'), checkOut: new Date('2032-01-02'),
      guests: 1, capacitySnapshot: 1, nightlyPriceAmount: '10.00', currency: 'USD', nights: 1, totalAmount: '10.00',
      accommodationVersion: 1, roomSourceUpdatedAt: new Date(), status, paymentStatus, paymentOrderId, holdExpiresAt,
    } });
    return { id, paymentOrderId };
  };

  const approved = (booking: { id: string; paymentOrderId: string }, eventId = randomUUID()) => ({
    eventId, eventType: 'payment.v1.approved' as const, schemaVersion: 1 as const, occurredAt: new Date().toISOString(),
    paymentId: booking.paymentOrderId, bookingId: booking.id, payerUserId: randomUUID(), amountMinor: 1000, currency: 'USD',
  });

  it('confirms exactly once with outbox and notification work, and treats replays idempotently', async () => {
    const booking = await create();
    const event = approved(booking);
    eventIds.push(event.eventId);
    await expect(paymentResults.apply(event, 'a'.repeat(64))).resolves.toBe('APPLIED');
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'CAPTURED', holdExpiresAt: null });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: booking.id, eventType: 'booking.v1.confirmed' } })).toBe(1);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: booking.id, eventType: 'booking.v1.confirmed' } });
    expect(outbox.payload).toMatchObject({ bookingId: booking.id, guestId: stored.guestId, propertyName: 'P', roomName: 'R', checkIn: '2032-01-01', checkOut: '2032-01-02', guests: 1, totalPrice: '10.00', checkInAt: '2032-01-01T00:00:00.000Z' });
    expect(await prisma.notificationWork.count({ where: { bookingId: booking.id, operation: 'BOOKING_CONFIRMED' } })).toBe(1);
    await expect(paymentResults.apply(event, 'a'.repeat(64))).resolves.toBe('DUPLICATE');
    expect(await prisma.notificationWork.count({ where: { bookingId: booking.id } })).toBe(1);

    const late = approved(booking);
    eventIds.push(late.eventId);
    await expect(paymentResults.apply(late, 'd'.repeat(64))).resolves.toBe('APPLIED');
    expect(await prisma.notificationWork.count({ where: { bookingId: booking.id } })).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED');
  });

  it('applies declined and definitive failed results without notification work', async () => {
    const declined = await create();
    const declinedEvent = { ...approved(declined), eventType: 'payment.v1.declined' as const, failureCode: 'CARD_DECLINED' as const };
    eventIds.push(declinedEvent.eventId);
    await expect(paymentResults.apply(declinedEvent, 'b'.repeat(64))).resolves.toBe('APPLIED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: declined.id } })).status).toBe('PAYMENT_FAILED');
    expect(await prisma.notificationWork.count({ where: { bookingId: declined.id } })).toBe(0);

    const failed = await create();
    const failedEvent = { ...approved(failed), eventType: 'payment.v1.failed' as const, failureCode: 'GATEWAY_UNAVAILABLE' as const };
    eventIds.push(failedEvent.eventId);
    await expect(paymentResults.apply(failedEvent, 'e'.repeat(64))).resolves.toBe('APPLIED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe('PAYMENT_FAILED');
  });

  it('keeps review_required uncertain, preserves the hold and blocks expiry', async () => {
    const booking = await create('PENDING_PAYMENT', 'PENDING', new Date(Date.now() - 1_000));
    const event = { ...approved(booking), eventType: 'payment.v1.review_required' as const, reasonCode: 'RECONCILIATION_EXHAUSTED' as const };
    eventIds.push(event.eventId);
    await expect(paymentResults.apply(event, 'f'.repeat(64))).resolves.toBe('APPLIED');
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.status).toBe('PENDING_PAYMENT');
    expect(stored.paymentStatus).toBe('REVIEW_REQUIRED');
    expect(stored.holdExpiresAt).not.toBeNull();
    await expiry.expire(100);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('PENDING_PAYMENT');
  });

  it('applies partial and total refunds without reactivating inventory', async () => {
    const booking = await create('CANCELLED_BY_GUEST', 'REFUND_PENDING', null);
    const partial = {
      ...approved(booking), eventType: 'payment.v1.refunded' as const, refundId: randomUUID(),
      refundedAmountMinor: 400, totalRefundedAmountMinor: 400, reason: 'GUEST_CANCELLATION' as const, paymentStatus: 'PARTIALLY_REFUNDED' as const,
    };
    eventIds.push(partial.eventId);
    await expect(refundResults.apply(partial, '1'.repeat(64))).resolves.toBe('APPLIED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus).toBe('PARTIALLY_REFUNDED');

    const total = {
      ...approved(booking), eventType: 'payment.v1.refunded' as const, refundId: randomUUID(),
      refundedAmountMinor: 600, totalRefundedAmountMinor: 1000, reason: 'GUEST_CANCELLATION' as const, paymentStatus: 'REFUNDED' as const,
    };
    eventIds.push(total.eventId);
    await expect(refundResults.apply(total, '2'.repeat(64))).resolves.toBe('APPLIED');
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.paymentStatus).toBe('REFUNDED');
    expect(stored.status).toBe('CANCELLED_BY_GUEST');
  });

  it('records definitive refund failure and refund uncertainty without changing cancellation state', async () => {
    const failed = await create('CANCELLED_BY_OWNER', 'REFUND_PENDING', null);
    const failedEvent = {
      ...approved(failed), eventType: 'payment.v1.refund_failed' as const, refundId: randomUUID(),
      reason: 'OWNER_CANCELLATION' as const, failureCode: 'CARD_DECLINED' as const,
    };
    eventIds.push(failedEvent.eventId);
    await expect(refundResults.apply(failedEvent, '3'.repeat(64))).resolves.toBe('APPLIED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: failed.id } })).paymentStatus).toBe('REFUND_FAILED');

    const review = await create('CANCELLED_BY_GUEST', 'REFUND_PENDING', null);
    const reviewEvent = {
      ...approved(review), eventType: 'payment.v1.refund_review_required' as const, refundId: randomUUID(),
      reasonCode: 'RECONCILIATION_EXHAUSTED' as const, refundAmountMinor: 1000,
    };
    eventIds.push(reviewEvent.eventId);
    await expect(refundResults.apply(reviewEvent, '4'.repeat(64))).resolves.toBe('APPLIED');
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: review.id } });
    expect(stored.paymentStatus).toBe('REFUND_REVIEW_REQUIRED');
    expect(stored.status).toBe('CANCELLED_BY_GUEST');
    expect(await prisma.bookingTransition.count({ where: { bookingId: review.id, reasonCode: 'REFUND_REVIEW_REQUIRED' } })).toBe(1);
  });

  it('rejects a different payload hash for the same eventId without mutating', async () => {
    const booking = await create();
    const event = approved(booking);
    eventIds.push(event.eventId);
    await expect(paymentResults.apply(event, '5'.repeat(64))).resolves.toBe('APPLIED');
    await expect(paymentResults.apply(event, '6'.repeat(64))).rejects.toMatchObject({ code: 'EVENT_ID_CONFLICT' });
    expect(await prisma.notificationWork.count({ where: { bookingId: booking.id } })).toBe(1);
  });
});
