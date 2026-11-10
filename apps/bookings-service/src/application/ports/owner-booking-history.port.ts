import type { StoredBooking } from './create-booking.unit-of-work';

export interface OwnerBookingHistoryFilter {
  ownerId: string;
  from?: string;
  to?: string;
  status?: string;
  guestId?: string;
  page: number;
  pageSize: number;
}

export interface BookingPage {
  items: StoredBooking[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

export interface OwnerBookingHistoryPort {
  findPage(filter: OwnerBookingHistoryFilter): Promise<BookingPage>;
}

export const OWNER_BOOKING_HISTORY_PORT = Symbol('OWNER_BOOKING_HISTORY_PORT');
