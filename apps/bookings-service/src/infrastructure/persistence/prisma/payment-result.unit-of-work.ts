import { Injectable } from '@nestjs/common';
import type { PaymentResultEvent, PaymentResultUnitOfWork } from '@bookings/application/ports/payment-saga.port';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaPaymentResultUnitOfWork implements PaymentResultUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}
  public async apply(event: PaymentResultEvent, hash: string): Promise<'APPLIED'|'DUPLICATE'> {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.processedEvent.findUnique({ where: { eventId: event.eventId } });
      if (prior) { if (prior.payloadHash !== hash) throw new DomainError('EVENT_ID_CONFLICT'); return 'DUPLICATE'; }
      const booking = await tx.booking.findUnique({ where: { id: event.bookingId } });
      if (!booking || booking.paymentOrderId !== event.paymentOrderId) throw new DomainError('PAYMENT_BOOKING_MISMATCH');
      const target = event.eventType === 'payment.v1.confirmed' ? 'CONFIRMED' : 'PAYMENT_FAILED';
      if (booking.status === 'PENDING_PAYMENT') {
        await tx.booking.update({ where: { id: booking.id }, data: { status: target, paymentStatus: event.eventType === 'payment.v1.confirmed' ? 'CAPTURED' : 'FAILED', holdExpiresAt: null, version: { increment: 1 } } });
        await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, fromStatus: booking.status, toStatus: target, actorType: 'SYSTEM', reasonCode: event.eventType === 'payment.v1.confirmed' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_FAILED', metadata: { eventId: event.eventId } } });
        if (target === 'CONFIRMED') await tx.outboxEvent.create({ data: { id: crypto.randomUUID(), aggregateId: booking.id, eventType: 'booking.v1.confirmed', payload: { bookingId: booking.id, guestId: booking.guestId, propertyId: booking.propertyId } } });
      }
      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.eventType, payloadHash: hash, outcome: booking.status === 'PENDING_PAYMENT' ? 'APPLIED' : 'IGNORED_TERMINAL' } });
      return 'APPLIED';
    });
  }
}
