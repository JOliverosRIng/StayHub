import { SendBookingConfirmedNotificationWorker } from '@bookings/application/notifications/send-booking-confirmed-notification.worker';
import { NotificationDeliveryError } from '@bookings/application/ports/booking-notifications.port';

const booking = {
  id: '22222222-2222-4222-8222-222222222222',
  guestId: '11111111-1111-4111-8111-111111111111',
  propertyName: 'Hotel',
  roomName: 'Suite',
  checkIn: '2030-01-01',
  checkOut: '2030-01-02',
  guests: 2,
  totalAmount: '20.00',
  status: 'CONFIRMED',
};
const command = {
  userId: booking.guestId,
  bookingId: booking.id,
  propertyName: booking.propertyName,
  roomName: booking.roomName,
  checkIn: booking.checkIn,
  checkOut: booking.checkOut,
  guests: booking.guests,
  totalPrice: booking.totalAmount,
  checkInAt: '2030-01-01T00:00:00.000Z',
};

const setup = (claimed: Array<{ id: string; bookingId: string; attempts: number }>, found: unknown = booking, maxAttempts = 3) => {
  const work = { claim: jest.fn().mockResolvedValue(claimed), succeeded: jest.fn(), retry: jest.fn(), dead: jest.fn() };
  const bookings = { findById: jest.fn().mockResolvedValue(found) };
  const notifications = { sendBookingConfirmed: jest.fn() };
  return { work, bookings, notifications, worker: new SendBookingConfirmedNotificationWorker(work, bookings as never, notifications, maxAttempts) };
};

describe('SendBookingConfirmedNotificationWorker', () => {
  it('sends the canonical payload and succeeds', async () => {
    const { work, notifications, worker } = setup([{ id: 'w1', bookingId: booking.id, attempts: 1 }]);
    notifications.sendBookingConfirmed.mockResolvedValue(undefined);
    await expect(worker.runOnce()).resolves.toBe(1);
    expect(notifications.sendBookingConfirmed).toHaveBeenCalledWith(command);
    expect(work.succeeded).toHaveBeenCalledWith('w1');
  });

  it('retries a transient delivery failure', async () => {
    const { work, notifications, worker } = setup([{ id: 'w1', bookingId: booking.id, attempts: 1 }]);
    notifications.sendBookingConfirmed.mockRejectedValue(new NotificationDeliveryError('RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE'));
    await worker.runOnce();
    expect(work.retry).toHaveBeenCalledWith('w1', 1, 'NOTIFICATIONS_UNAVAILABLE');
    expect(work.dead).not.toHaveBeenCalled();
  });

  it('dead-letters a permanent conflict', async () => {
    const { work, notifications, worker } = setup([{ id: 'w1', bookingId: booking.id, attempts: 1 }]);
    notifications.sendBookingConfirmed.mockRejectedValue(new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_CONFLICT'));
    await worker.runOnce();
    expect(work.dead).toHaveBeenCalledWith('w1', 'NOTIFICATIONS_CONFLICT');
  });

  it('dead-letters a retryable failure after the attempt budget', async () => {
    const { work, notifications, worker } = setup([{ id: 'w1', bookingId: booking.id, attempts: 3 }], booking, 3);
    notifications.sendBookingConfirmed.mockRejectedValue(new NotificationDeliveryError('RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE'));
    await worker.runOnce();
    expect(work.dead).toHaveBeenCalledWith('w1', 'NOTIFICATIONS_UNAVAILABLE');
    expect(work.retry).not.toHaveBeenCalled();
  });

  it('does not notify a booking that is no longer confirmed', async () => {
    const { work, notifications, worker } = setup([{ id: 'w1', bookingId: booking.id, attempts: 1 }], { ...booking, status: 'CANCELLED_BY_GUEST' });
    await worker.runOnce();
    expect(notifications.sendBookingConfirmed).not.toHaveBeenCalled();
    expect(work.dead).toHaveBeenCalledWith('w1', 'BOOKING_NOT_CONFIRMED');
  });

  it('dead-letters a missing booking', async () => {
    const { work, worker } = setup([{ id: 'w1', bookingId: booking.id, attempts: 1 }], null);
    await worker.runOnce();
    expect(work.dead).toHaveBeenCalledWith('w1', 'BOOKING_NOT_FOUND');
  });
});
