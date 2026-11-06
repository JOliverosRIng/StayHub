import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/client';
import type { CancelGuestBookingUnitOfWork, PersistGuestCancellation } from '@bookings/application/ports/cancel-guest-booking.unit-of-work';
import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';
import { mapBooking } from './booking.repository';

@Injectable()
export class PrismaCancelGuestBookingUnitOfWork implements CancelGuestBookingUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async cancel(input: PersistGuestCancellation): Promise<StoredBooking> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!current || current.guestId !== input.actorId) throw new DomainError('NOT_FOUND');
      if (current.status === 'CANCELLED_BY_GUEST') return mapBooking(current);
      if (current.version !== input.expectedVersion || (current.status !== 'PENDING_PAYMENT' && current.status !== 'CONFIRMED')) throw new DomainError('STATE_CONFLICT');

      const changed = await tx.booking.updateMany({ where: { id: current.id, version: current.version, status: current.status }, data: {
        status: 'CANCELLED_BY_GUEST', cancelledBy: 'GUEST', cancelledAt: input.now, cancellationPolicyVersion: input.decision.policyVersion, holdExpiresAt: null, version: { increment: 1 },
      } });
      if (changed.count !== 1) throw new DomainError('STATE_CONFLICT');

      await tx.bookingTransition.create({ data: {
        id: randomUUID(), bookingId: current.id, fromStatus: current.status, toStatus: 'CANCELLED_BY_GUEST', actorType: 'GUEST', actorId: input.actorId, reasonCode: 'CANCELLED_BY_GUEST',
        metadata: { policyVersion: input.decision.policyVersion, refundMode: input.decision.refundMode },
      } });
      await tx.cancellationDecision.create({ data: {
        id: randomUUID(), bookingId: current.id, policyVersion: input.decision.policyVersion, actorType: 'GUEST', eligible: input.decision.eligible, refundMode: input.decision.refundMode,
      } });
      await tx.outboxEvent.create({ data: {
        id: randomUUID(), aggregateId: current.id, eventType: 'booking.v1.cancelled', payload: { bookingId: current.id, cancelledBy: 'GUEST' },
      } });
      if (input.decision.refundMode !== 'NONE' && current.paymentStatus === 'CAPTURED' && current.paymentOrderId) {
        await tx.paymentWork.create({ data: {
          id: randomUUID(), bookingId: current.id, operation: 'REQUEST_REFUND', idempotencyKey: `booking:${current.id}:refund`, amount: new Prisma.Decimal(current.totalAmount), currency: current.currency,
        } });
      }

      const row = await tx.booking.findUniqueOrThrow({ where: { id: current.id } });
      return mapBooking(row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
