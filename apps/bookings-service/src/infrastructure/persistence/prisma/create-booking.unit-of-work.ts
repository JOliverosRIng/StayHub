import { Injectable } from '@nestjs/common';
import { Prisma, type BookingStatus, type PaymentStatus } from '../generated/client';
import type { CreateBookingUnitOfWork, PersistCreateBooking, StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';
import { mapBooking } from './booking.repository';

@Injectable()
export class PrismaCreateBookingUnitOfWork implements CreateBookingUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}
  public async create(input: PersistCreateBooking): Promise<StoredBooking> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({ where: { guestId_key: { guestId: input.booking.data.guestId, key: input.idempotencyKey } }, include: { booking: true } });
        if (existing) {
          if (existing.requestHash !== input.requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT');
          if (existing.booking) return mapBooking(existing.booking);
          throw new DomainError('IDEMPOTENCY_IN_PROGRESS');
        }
        const b = input.booking; const now = new Date();
        const row = await tx.booking.create({ data: { id: b.id, guestId: b.data.guestId, ownerId: b.data.snapshot.ownerId, propertyId: b.data.snapshot.propertyId, roomId: b.data.snapshot.roomId, propertyName: b.data.snapshot.propertyName, roomName: b.data.snapshot.roomName, checkIn: new Date(`${b.data.period.checkIn}T00:00:00.000Z`), checkOut: new Date(`${b.data.period.checkOut}T00:00:00.000Z`), guests: b.data.guests, capacitySnapshot: b.data.snapshot.capacity, nightlyPriceAmount: new Prisma.Decimal(b.data.nightlyPrice.toString()), currency: b.data.nightlyPrice.currency, nights: b.data.period.nights, totalAmount: new Prisma.Decimal(b.total.toString()), accommodationVersion: b.data.snapshot.propertyVersion, roomSourceUpdatedAt: b.data.snapshot.roomUpdatedAt, status: b.status as BookingStatus, paymentStatus: 'ORDER_PENDING' as PaymentStatus, holdExpiresAt: b.data.holdExpiresAt } });
        await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: row.id, toStatus: row.status, actorType: 'GUEST', actorId: row.guestId, reasonCode: 'BOOKING_CREATED', metadata: { traceId: input.traceId ?? null } } });
        await tx.idempotencyRecord.create({ data: { guestId: row.guestId, key: input.idempotencyKey, requestHash: input.requestHash, bookingId: row.id, state: 'COMPLETED', responseStatus: 201, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } });
        await tx.paymentWork.create({ data: { id: crypto.randomUUID(), bookingId: row.id, operation: 'CREATE_ORDER', idempotencyKey: `booking:${row.id}:payment-order`, amount: row.totalAmount, currency: row.currency } });
        await tx.outboxEvent.create({ data: { id: crypto.randomUUID(), aggregateId: row.id, eventType: 'booking.v1.created', payload: { bookingId: row.id, guestId: row.guestId, ownerId: row.ownerId, propertyId: row.propertyId, roomId: row.roomId, checkIn: b.data.period.checkIn, checkOut: b.data.period.checkOut, total: { amount: b.total.toString(), currency: b.total.currency }, status: row.status } } });
        return mapBooking(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
      const text = error instanceof Error ? `${error.message} ${code}` : 'unknown persistence error';
      if (/bookings_no_overlap|23P01|P2004/iu.test(text)) throw new DomainError('BOOKING_CONFLICT');
      throw error;
    }
  }
}
