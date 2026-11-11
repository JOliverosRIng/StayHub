import { Injectable } from '@nestjs/common';
import type { RefundResultEvent, RefundResultUnitOfWork } from '@bookings/application/ports/payment-saga.port';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';

const REFUND_STATES = ['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_FAILED', 'REFUND_REVIEW_REQUIRED'] as const;

@Injectable()
export class PrismaRefundResultUnitOfWork implements RefundResultUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async apply(event: RefundResultEvent, hash: string): Promise<'APPLIED' | 'DUPLICATE'> {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.processedEvent.findUnique({ where: { eventId: event.eventId } });
      if (prior) {
        if (prior.payloadHash !== hash) throw new DomainError('EVENT_ID_CONFLICT');
        return 'DUPLICATE';
      }

      const booking = await tx.booking.findUnique({ where: { id: event.bookingId } });
      if (!booking) throw new DomainError('PAYMENT_BOOKING_MISMATCH');
      if (!booking.paymentOrderId) throw new DomainError('PAYMENT_BOOKING_NOT_READY');
      if (booking.paymentOrderId !== event.paymentId) throw new DomainError('PAYMENT_BOOKING_MISMATCH');

      const cancelled = booking.status === 'CANCELLED_BY_GUEST' || booking.status === 'CANCELLED_BY_OWNER';
      const refundExpected = (REFUND_STATES as readonly string[]).includes(booking.paymentStatus);
      let outcome = 'IGNORED_TERMINAL';

      if (cancelled || refundExpected) {
        if (event.eventType === 'payment.v1.refunded') {
          const target = event.paymentStatus;
          if (!(booking.paymentStatus === 'REFUNDED' && target === 'PARTIALLY_REFUNDED')) {
            const changed = target === 'REFUNDED'
              ? await tx.booking.updateMany({ where: { id: booking.id }, data: { paymentStatus: 'REFUNDED' } })
              : await tx.booking.updateMany({ where: { id: booking.id, paymentStatus: { not: 'REFUNDED' } }, data: { paymentStatus: 'PARTIALLY_REFUNDED' } });
            if (changed.count === 1 || booking.paymentStatus === target) {
              await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, fromStatus: booking.status, toStatus: booking.status, actorType: 'SYSTEM', reasonCode: 'REFUND_COMPLETED', metadata: { eventId: event.eventId, refundId: event.refundId, refundedAmountMinor: event.refundedAmountMinor, totalRefundedAmountMinor: event.totalRefundedAmountMinor, paymentStatus: target } } });
              outcome = 'APPLIED';
            }
          }
        } else if (event.eventType === 'payment.v1.refund_failed') {
          const changed = await tx.booking.updateMany({ where: { id: booking.id, paymentStatus: { not: 'REFUNDED' } }, data: { paymentStatus: 'REFUND_FAILED' } });
          if (changed.count === 1 || booking.paymentStatus === 'REFUND_FAILED') {
            await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, fromStatus: booking.status, toStatus: booking.status, actorType: 'SYSTEM', reasonCode: 'REFUND_FAILED', metadata: { eventId: event.eventId, refundId: event.refundId, reason: event.reason, failureCode: event.failureCode } } });
            outcome = 'APPLIED';
          }
        } else {
          const changed = await tx.booking.updateMany({ where: { id: booking.id, paymentStatus: { not: 'REFUNDED' } }, data: { paymentStatus: 'REFUND_REVIEW_REQUIRED' } });
          if (changed.count === 1 || booking.paymentStatus === 'REFUND_REVIEW_REQUIRED') {
            await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, fromStatus: booking.status, toStatus: booking.status, actorType: 'SYSTEM', reasonCode: 'REFUND_REVIEW_REQUIRED', metadata: { eventId: event.eventId, refundId: event.refundId, refundAmountMinor: event.refundAmountMinor, reasonCode: event.reasonCode } } });
            outcome = 'APPLIED';
          }
        }
      }

      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.eventType, payloadHash: hash, outcome } });
      return 'APPLIED';
    });
  }
}
