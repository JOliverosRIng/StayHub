import { BOOKING_READ_PORT, type BookingReadPort } from '@bookings/application/ports/booking-read.port';
import { CANCEL_OWNER_BOOKING_UOW, type CancelOwnerBookingUnitOfWork } from '@bookings/application/ports/cancel-owner-booking.unit-of-work';
import type { BookingSettings } from '@bookings/application/ports/booking-settings.port';
import { CLOCK_PORT, type ClockPort } from '@bookings/application/ports/clock.port';
import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';

export interface CancelOwnerBookingCommand {
  bookingId: string;
  ownerId: string;
  reason: string;
}

export class CancelOwnerBookingUseCase {
  public static readonly dependencies = [BOOKING_READ_PORT, CANCEL_OWNER_BOOKING_UOW, CLOCK_PORT] as const;
  public constructor(
    private readonly bookings: BookingReadPort,
    private readonly unitOfWork: CancelOwnerBookingUnitOfWork,
    private readonly clock: ClockPort,
    private readonly settings: BookingSettings,
  ) {}

  public async execute(command: CancelOwnerBookingCommand): Promise<StoredBooking> {
    const reason = command.reason.trim();
    if (!reason || reason.length > 500) throw new DomainError('VALIDATION_ERROR', 'reason');
    const booking = await this.bookings.findById(command.bookingId);
    if (!booking || booking.ownerId !== command.ownerId) throw new DomainError('NOT_FOUND');
    if (booking.status === 'CANCELLED_BY_OWNER') return booking;
    if (booking.status !== 'PENDING_PAYMENT' && booking.status !== 'CONFIRMED') throw new DomainError('STATE_CONFLICT');
    return this.unitOfWork.cancel({ bookingId: booking.id, expectedVersion: booking.version, actorId: command.ownerId, reason, now: this.clock.now(), policyVersion: this.settings.cancellationPolicyVersion });
  }
}
