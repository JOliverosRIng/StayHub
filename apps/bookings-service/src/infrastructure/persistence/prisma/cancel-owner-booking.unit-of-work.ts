import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/client';
import type { CancelOwnerBookingUnitOfWork, PersistOwnerCancellation } from '@bookings/application/ports/cancel-owner-booking.unit-of-work';
import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';
import { mapBooking } from './booking.repository';

@Injectable()
export class PrismaCancelOwnerBookingUnitOfWork implements CancelOwnerBookingUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async cancel(input: PersistOwnerCancellation): Promise<StoredBooking> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!current || current.ownerId !== input.actorId) throw new DomainError('NOT_FOUND');
      if (current.status === 'CANCELLED_BY_OWNER') return mapBooking(current);
      if (current.version !== input.expectedVersion || (current.status !== 'PENDING_PAYMENT' && current.status !== 'CONFIRMED')) throw new DomainError('STATE_CONFLICT');

      const changed = await tx.booking.updateMany({ where: { id: current.id, version: current.version, status: current.status }, data: {
        status: 'CANCELLED_BY_OWNER', cancelledBy: 'OWNER', cancelledAt: input.now, cancellationReason: input.reason, cancellationPolicyVersion: input.policyVersion, holdExpiresAt: null, version: { increment: 1 },
      } });
      if (changed.count !== 1) throw new DomainError('STATE_CONFLICT');

      await tx.bookingTransition.create({ data: {
        id: randomUUID(), bookingId: current.id, fromStatus: current.status, toStatus: 'CANCELLED_BY_OWNER', actorType: 'OWNER', actorId: input.actorId, reasonCode: 'CANCELLED_BY_OWNER',
        metadata: { policyVersion: input.policyVersion, refundMode: 'FULL' },
      } });
      await tx.cancellationDecision.create({ data: {
        id: randomUUID(), bookingId: current.id, policyVersion: input.policyVersion, actorType: 'OWNER', eligible: true, refundMode: 'FULL',
      } });
      await tx.outboxEvent.create({ data: {
        id: randomUUID(), aggregateId: current.id, eventType: 'booking.v1.cancelled', payload: { bookingId: current.id, cancelledBy: 'OWNER' },
      } });
      if (current.paymentStatus === 'CAPTURED' && current.paymentOrderId) {
        await tx.paymentWork.create({ data: {
          id: randomUUID(), bookingId: current.id, operation: 'REQUEST_REFUND', idempotencyKey: `booking:${current.id}:refund`, amount: new Prisma.Decimal(current.totalAmount), currency: current.currency,
        } });
      }

      const row = await tx.booking.findUniqueOrThrow({ where: { id: current.id } });
      return mapBooking(row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
