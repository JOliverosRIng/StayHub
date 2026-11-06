import { BOOKING_READ_PORT, type BookingReadPort } from '@bookings/application/ports/booking-read.port';
import { CLOCK_PORT, type ClockPort } from '@bookings/application/ports/clock.port';
import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import { STAY_LIFECYCLE_UOW, type StayLifecycleUnitOfWork } from '@bookings/application/ports/stay-lifecycle.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';

export interface CheckInBookingCommand {
  bookingId: string;
  ownerId: string;
}

export class CheckInBookingUseCase {
  public static readonly dependencies = [BOOKING_READ_PORT, STAY_LIFECYCLE_UOW, CLOCK_PORT] as const;
  public constructor(private readonly bookings: BookingReadPort, private readonly unitOfWork: StayLifecycleUnitOfWork, private readonly clock: ClockPort) {}

  public async execute(command: CheckInBookingCommand): Promise<StoredBooking> {
    const booking = await this.bookings.findById(command.bookingId);
    if (!booking || booking.ownerId !== command.ownerId) throw new DomainError('NOT_FOUND');
    if (booking.status === 'CHECKED_IN') return booking;
    if (booking.status !== 'CONFIRMED') throw new DomainError('STATE_CONFLICT');
    const today = this.clock.today();
    if (today < booking.checkIn || today >= booking.checkOut) throw new DomainError('STATE_CONFLICT');
    return this.unitOfWork.checkIn({ bookingId: booking.id, expectedVersion: booking.version, actorId: command.ownerId, now: this.clock.now() });
  }
}
