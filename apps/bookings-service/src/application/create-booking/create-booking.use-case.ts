import { createHash } from 'node:crypto';
import { ACCOMMODATION_QUOTE_PORT, type AccommodationQuotePort } from '@bookings/application/ports/accommodation-quote.port';
import { CLOCK_PORT, type ClockPort } from '@bookings/application/ports/clock.port';
import { CREATE_BOOKING_UOW, type CreateBookingUnitOfWork, type StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import type { BookingSettings } from '@bookings/application/ports/booking-settings.port';
import { StayPeriod } from '@bookings/domain/bookings/stay-period';
import { Money } from '@bookings/domain/money/money';
import { Booking } from '@bookings/domain/bookings/booking';

export interface CreateBookingCommand { guestId: string; propertyId: string; roomId: string; checkIn: string; checkOut: string; guests: number; idempotencyKey: string; traceId?: string; }
export class CreateBookingUseCase {
  public static readonly dependencies = [ACCOMMODATION_QUOTE_PORT, CLOCK_PORT, CREATE_BOOKING_UOW] as const;
  public constructor(private readonly quotes: AccommodationQuotePort, private readonly clock: ClockPort, private readonly uow: CreateBookingUnitOfWork, private readonly config: BookingSettings) {}
  public async execute(command: CreateBookingCommand): Promise<StoredBooking> {
    const period = StayPeriod.create(command.checkIn, command.checkOut, this.clock.today());
    const quote = await this.quotes.getQuote(command.propertyId, command.roomId, command.guests, command.traceId);
    const booking = new Booking({ guestId: command.guestId, guests: command.guests, period, nightlyPrice: Money.parse(quote.basePrice.amount, quote.basePrice.currency), snapshot: { propertyId: quote.propertyId, roomId: quote.roomId, ownerId: quote.ownerId, propertyName: quote.propertyName, roomName: quote.roomName, capacity: quote.capacity, propertyVersion: quote.propertyVersion, roomUpdatedAt: new Date(quote.roomUpdatedAt) }, holdExpiresAt: new Date(this.clock.now().getTime() + this.config.paymentHoldMinutes * 60_000) });
    const canonical = JSON.stringify({ propertyId: command.propertyId, roomId: command.roomId, checkIn: command.checkIn, checkOut: command.checkOut, guests: command.guests });
    return this.uow.create({ booking, idempotencyKey: command.idempotencyKey, requestHash: createHash('sha256').update(canonical).digest('hex'), ...(command.traceId ? { traceId: command.traceId } : {}) });
  }
}
