import { BOOKING_READ_PORT, type BookingReadPort } from '@bookings/application/ports/booking-read.port';
import { DomainError } from '@bookings/domain/shared/domain-error';

export interface GetReviewEligibilityQuery {
  bookingId: string;
  guestId: string;
}

export interface ReviewEligibility {
  bookingId: string;
  guestId: string;
  propertyId: string;
  eligible: boolean;
}

export class GetReviewEligibilityUseCase {
  public static readonly dependencies = [BOOKING_READ_PORT] as const;
  public constructor(private readonly bookings: BookingReadPort) {}

  public async execute(query: GetReviewEligibilityQuery): Promise<ReviewEligibility> {
    const booking = await this.bookings.findById(query.bookingId);
    if (!booking || booking.guestId !== query.guestId || booking.status !== 'COMPLETED') throw new DomainError('NOT_FOUND');
    return { bookingId: booking.id, guestId: booking.guestId, propertyId: booking.propertyId, eligible: true };
  }
}
