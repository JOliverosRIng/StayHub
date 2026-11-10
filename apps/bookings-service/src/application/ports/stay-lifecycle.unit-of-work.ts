import type { StoredBooking } from './create-booking.unit-of-work';

export interface CheckInInput {
  bookingId: string;
  expectedVersion: number;
  actorId: string;
  now: Date;
}

export interface CheckOutInput {
  bookingId: string;
  expectedVersion: number;
  actorId: string;
  now: Date;
}

export interface StayLifecycleUnitOfWork {
  checkIn(input: CheckInInput): Promise<StoredBooking>;
  checkOut(input: CheckOutInput): Promise<StoredBooking>;
}

export const STAY_LIFECYCLE_UOW = Symbol('STAY_LIFECYCLE_UOW');
