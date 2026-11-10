import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/client';
import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import type { CheckInInput, CheckOutInput, StayLifecycleUnitOfWork } from '@bookings/application/ports/stay-lifecycle.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';
import { mapBooking } from './booking.repository';

@Injectable()
export class PrismaStayLifecycleUnitOfWork implements StayLifecycleUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async checkIn(input: CheckInInput): Promise<StoredBooking> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!current || current.ownerId !== input.actorId) throw new DomainError('NOT_FOUND');
      if (current.status === 'CHECKED_IN') return mapBooking(current);
      if (current.version !== input.expectedVersion || current.status !== 'CONFIRMED') throw new DomainError('STATE_CONFLICT');
      const changed = await tx.booking.updateMany({ where: { id: current.id, version: current.version, status: 'CONFIRMED' }, data: { status: 'CHECKED_IN', checkedInAt: input.now, version: { increment: 1 } } });
      if (changed.count !== 1) throw new DomainError('STATE_CONFLICT');
      await tx.bookingTransition.create({ data: {
        id: randomUUID(), bookingId: current.id, fromStatus: 'CONFIRMED', toStatus: 'CHECKED_IN', actorType: 'OWNER', actorId: input.actorId, reasonCode: 'CHECKED_IN', metadata: {},
      } });
      return mapBooking(await tx.booking.findUniqueOrThrow({ where: { id: current.id } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  public async checkOut(input: CheckOutInput): Promise<StoredBooking> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!current || current.ownerId !== input.actorId) throw new DomainError('NOT_FOUND');
      if (current.status === 'COMPLETED') return mapBooking(current);
      if (current.version !== input.expectedVersion || current.status !== 'CHECKED_IN') throw new DomainError('STATE_CONFLICT');
      const changed = await tx.booking.updateMany({ where: { id: current.id, version: current.version, status: 'CHECKED_IN' }, data: { status: 'COMPLETED', checkedOutAt: input.now, version: { increment: 1 } } });
      if (changed.count !== 1) throw new DomainError('STATE_CONFLICT');
      await tx.bookingTransition.create({ data: {
        id: randomUUID(), bookingId: current.id, fromStatus: 'CHECKED_IN', toStatus: 'COMPLETED', actorType: 'OWNER', actorId: input.actorId, reasonCode: 'COMPLETED', metadata: {},
      } });
      await tx.outboxEvent.create({ data: {
        id: randomUUID(), aggregateId: current.id, eventType: 'booking.v1.completed', payload: { bookingId: current.id, guestId: current.guestId, propertyId: current.propertyId },
      } });
      return mapBooking(await tx.booking.findUniqueOrThrow({ where: { id: current.id } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
