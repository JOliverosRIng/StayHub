import { Injectable } from '@nestjs/common';
import type { RefundResultEvent, RefundResultUnitOfWork } from '@bookings/application/ports/payment-saga.port';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaRefundResultUnitOfWork implements RefundResultUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}
  public async apply(event: RefundResultEvent, hash: string): Promise<'APPLIED' | 'DUPLICATE'> {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.processedEvent.findUnique({ where: { eventId: event.eventId } });
      if (prior) { if (prior.payloadHash !== hash) throw new DomainError('EVENT_ID_CONFLICT'); return 'DUPLICATE'; }
      const booking = await tx.booking.findUnique({ where: { id: event.bookingId } });
      if (!booking || booking.paymentOrderId !== event.paymentOrderId) throw new DomainError('PAYMENT_BOOKING_MISMATCH');
      const cancelled = booking.status === 'CANCELLED_BY_GUEST' || booking.status === 'CANCELLED_BY_OWNER';
      if (cancelled && booking.paymentStatus !== 'REFUNDED') await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'REFUNDED' } });
      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.eventType, payloadHash: hash, outcome: cancelled ? 'APPLIED' : 'IGNORED_TERMINAL' } });
      return 'APPLIED';
    });
  }
}
