export interface BookingConfirmedNotification {
  userId: string;
  bookingId: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice: string;
  checkInAt: string;
}

export type NotificationFailureKind = 'RETRYABLE' | 'PERMANENT';

export class NotificationDeliveryError extends Error {
  public constructor(public readonly kind: NotificationFailureKind, public readonly code: string) {
    super(code);
  }
}

export interface BookingNotificationsPort {
  sendBookingConfirmed(command: BookingConfirmedNotification): Promise<void>;
}

export const BOOKING_NOTIFICATIONS_PORT = Symbol('BOOKING_NOTIFICATIONS_PORT');
