import { BOOKING_READ_PORT, type BookingReadPort } from '@bookings/application/ports/booking-read.port';
import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import { DomainError } from '@bookings/domain/shared/domain-error';

export type BookingViewerRole = 'GUEST' | 'OWNER';

export interface GetBookingQuery {
  bookingId: string;
  actorId: string;
  actorRole?: string;
}

export interface GetBookingResult {
  booking: StoredBooking;
  viewer: { role: BookingViewerRole; sub: string };
}

export class GetBookingUseCase {
  public static readonly dependencies = [BOOKING_READ_PORT] as const;
  public constructor(private readonly bookings: BookingReadPort) {}

  public async execute(query: GetBookingQuery): Promise<GetBookingResult> {
    const booking = await this.bookings.findById(query.bookingId);
    if (!booking) throw new DomainError('NOT_FOUND');
    const isGuest = query.actorRole === 'GUEST' && booking.guestId === query.actorId;
    const isOwner = query.actorRole === 'OWNER' && booking.ownerId === query.actorId;
    if (!isGuest && !isOwner) throw new DomainError('NOT_FOUND');
    return { booking, viewer: { role: isOwner ? 'OWNER' : 'GUEST', sub: query.actorId } };
  }
}
