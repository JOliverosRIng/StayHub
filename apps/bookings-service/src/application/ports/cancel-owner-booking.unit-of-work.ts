import type { StoredBooking } from './create-booking.unit-of-work';

export interface PersistOwnerCancellation {
  bookingId: string;
  expectedVersion: number;
  actorId: string;
  reason: string;
  now: Date;
  policyVersion: string;
}

export interface CancelOwnerBookingUnitOfWork {
  cancel(input: PersistOwnerCancellation): Promise<StoredBooking>;
}

export const CANCEL_OWNER_BOOKING_UOW = Symbol('CANCEL_OWNER_BOOKING_UOW');
