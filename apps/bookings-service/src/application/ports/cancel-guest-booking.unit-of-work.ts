import type { CancellationDecision } from './cancellation-policy.port';
import type { StoredBooking } from './create-booking.unit-of-work';

export interface PersistGuestCancellation {
  bookingId: string;
  expectedVersion: number;
  actorId: string;
  now: Date;
  decision: CancellationDecision;
}

export interface CancelGuestBookingUnitOfWork {
  cancel(input: PersistGuestCancellation): Promise<StoredBooking>;
}

export const CANCEL_GUEST_BOOKING_UOW = Symbol('CANCEL_GUEST_BOOKING_UOW');
