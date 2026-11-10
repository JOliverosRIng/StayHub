import type { StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';

export interface BookingMoneyView {
  amount: string;
  currency: string;
}

export interface BookingView {
  id: string;
  guestId: string;
  ownerId?: string;
  propertyId: string;
  roomId: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  nightlyPrice: BookingMoneyView;
  total: BookingMoneyView;
  status: string;
  paymentStatus: string;
  holdExpiresAt: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingViewer {
  role?: string;
  sub: string;
}

export function presentBooking(booking: StoredBooking, viewer?: BookingViewer): BookingView {
  const base: BookingView = {
    id: booking.id,
    guestId: booking.guestId,
    propertyId: booking.propertyId,
    roomId: booking.roomId,
    propertyName: booking.propertyName,
    roomName: booking.roomName,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: booking.guests,
    nights: booking.nights,
    nightlyPrice: { amount: booking.nightlyPriceAmount, currency: booking.currency },
    total: { amount: booking.totalAmount, currency: booking.currency },
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    holdExpiresAt: booking.holdExpiresAt,
    ...(booking.cancellationReason !== null ? { cancellationReason: booking.cancellationReason } : {}),
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
  if (viewer?.role === 'OWNER' && viewer.sub === booking.ownerId) return { ...base, ownerId: booking.ownerId };
  return base;
}
