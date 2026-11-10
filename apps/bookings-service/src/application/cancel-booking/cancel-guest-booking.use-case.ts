import { BOOKING_READ_PORT, type BookingReadPort } from '@bookings/application/ports/booking-read.port';
import { CANCEL_GUEST_BOOKING_UOW, type CancelGuestBookingUnitOfWork } from '@bookings/application/ports/cancel-guest-booking.unit-of-work';
import { CANCELLATION_POLICY_PORT, type CancellationPolicyPort } from '@bookings/application/ports/cancellation-policy.port';
import { CLOCK_PORT, type ClockPort } from '@bookings/application/ports/clock.port';
import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';

export interface CancelGuestBookingCommand {
  bookingId: string;
  actorId: string;
}

export class CancelGuestBookingUseCase {
  public static readonly dependencies = [BOOKING_READ_PORT, CANCELLATION_POLICY_PORT, CANCEL_GUEST_BOOKING_UOW, CLOCK_PORT] as const;
  public constructor(
    private readonly bookings: BookingReadPort,
    private readonly policy: CancellationPolicyPort,
    private readonly unitOfWork: CancelGuestBookingUnitOfWork,
    private readonly clock: ClockPort,
  ) {}

  public async execute(command: CancelGuestBookingCommand): Promise<StoredBooking> {
    const booking = await this.bookings.findById(command.bookingId);
    if (!booking || booking.guestId !== command.actorId) throw new DomainError('NOT_FOUND');
    if (booking.status === 'CANCELLED_BY_GUEST') return booking;
    if (booking.status !== 'PENDING_PAYMENT' && booking.status !== 'CONFIRMED') throw new DomainError('STATE_CONFLICT');
    const now = this.clock.now();
    const decision = this.policy.evaluate({ actor: 'GUEST', status: booking.status, checkIn: booking.checkIn, now });
    if (!decision.eligible) throw new DomainError('CANCELLATION_NOT_ALLOWED');
    return this.unitOfWork.cancel({ bookingId: booking.id, expectedVersion: booking.version, actorId: command.actorId, now, decision });
  }
}
