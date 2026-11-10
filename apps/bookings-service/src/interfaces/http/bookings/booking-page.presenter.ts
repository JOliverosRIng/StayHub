import type { BookingPage } from '@bookings/application/ports/owner-booking-history.port';
import { presentBooking, type BookingView, type BookingViewer } from './booking.presenter';

export interface BookingPageView {
  items: BookingView[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

export function presentBookingPage(page: BookingPage, viewer: BookingViewer): BookingPageView {
  return { items: page.items.map((booking) => presentBooking(booking, viewer)), page: page.page, pageSize: page.pageSize, total: page.total, hasNext: page.hasNext };
}
