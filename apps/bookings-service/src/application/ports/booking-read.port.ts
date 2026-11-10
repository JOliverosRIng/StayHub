import type { StoredBooking } from './create-booking.unit-of-work';

export interface BookingReadPort {
  findById(id: string): Promise<StoredBooking | null>;
}

export const BOOKING_READ_PORT = Symbol('BOOKING_READ_PORT');
