import type { BookingReaderPort } from '@bookings/application/ports/payment-saga.port';
import { NotificationDeliveryError, type BookingNotificationsPort } from '@bookings/application/ports/booking-notifications.port';
import type { NotificationWorkPort } from '@bookings/application/ports/notification-work.port';

const NOTIFIABLE_STATUSES = new Set(['CONFIRMED', 'CHECKED_IN', 'COMPLETED']);

export class SendBookingConfirmedNotificationWorker {
  public constructor(
    private readonly work: NotificationWorkPort,
    private readonly bookings: BookingReaderPort,
    private readonly notifications: BookingNotificationsPort,
    private readonly maxAttempts: number,
  ) {}

  public async runOnce(limit = 10): Promise<number> {
    const claimed = await this.work.claim(limit);
    for (const item of claimed) {
      try {
        const booking = await this.bookings.findById(item.bookingId);
        if (!booking) {
          await this.work.dead(item.id, 'BOOKING_NOT_FOUND');
          continue;
        }
        if (!NOTIFIABLE_STATUSES.has(booking.status)) {
          await this.work.dead(item.id, 'BOOKING_NOT_CONFIRMED');
          continue;
        }
        await this.notifications.sendBookingConfirmed({
          userId: booking.guestId,
          bookingId: booking.id,
          propertyName: booking.propertyName,
          roomName: booking.roomName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guests: booking.guests,
          totalPrice: booking.totalAmount,
          checkInAt: `${booking.checkIn}T00:00:00.000Z`,
        });
        await this.work.succeeded(item.id);
      } catch (error) {
        const failure = error instanceof NotificationDeliveryError
          ? error
          : new NotificationDeliveryError('RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE');
        if (failure.kind === 'PERMANENT' || item.attempts >= this.maxAttempts) await this.work.dead(item.id, failure.code);
        else await this.work.retry(item.id, item.attempts, failure.code);
      }
    }
    return claimed.length;
  }
}
