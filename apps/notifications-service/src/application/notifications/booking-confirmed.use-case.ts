import type { ReminderScheduleRepository } from '../ports/reminder-schedule.repository';
import type { SendNotificationUseCase } from './send-notification.use-case';

export interface BookingConfirmedCommand {
  userId: string;
  bookingId: string;
  roomTitle: string;
  roomLocation: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice: number;
  checkInAt: string;
}

export interface BookingConfirmedResult {
  confirmation: Awaited<ReturnType<SendNotificationUseCase['execute']>>['notification'];
  reminderScheduledAt: string;
}

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export class InvalidBookingEventError extends Error {
  readonly code = 'INVALID_BOOKING_EVENT';
}

export class BookingConfirmedUseCase {
  constructor(
    private readonly sendNotification: SendNotificationUseCase,
    private readonly reminders: ReminderScheduleRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: BookingConfirmedCommand): Promise<BookingConfirmedResult> {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(command.checkInAt)) {
      throw new InvalidBookingEventError('Invalid check-in timestamp');
    }
    const checkInAt = new Date(command.checkInAt);
    if (Number.isNaN(checkInAt.getTime()) || command.checkIn !== command.checkInAt.slice(0, 10)) {
      throw new InvalidBookingEventError('Check-in date and instant do not match');
    }

    const confirmation = await this.sendNotification.execute({
      userId: command.userId,
      type: 'BOOKING_CONFIRMATION',
      channel: 'IN_APP',
      templateData: {
        bookingId: command.bookingId,
        roomTitle: command.roomTitle,
        roomLocation: command.roomLocation,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guests: command.guests,
        totalPrice: command.totalPrice,
      },
      idempotencyKey: `booking-confirmation:${command.bookingId}`,
    });

    const now = this.now();
    const scheduledAt = new Date(Math.max(now.getTime(), checkInAt.getTime() - REMINDER_LEAD_MS));
    await this.reminders.scheduleBookingReminder({
      bookingId: command.bookingId,
      userId: command.userId,
      roomTitle: command.roomTitle,
      roomLocation: command.roomLocation,
      checkIn: command.checkIn,
      scheduledAt,
    });

    return { confirmation: confirmation.notification, reminderScheduledAt: scheduledAt.toISOString() };
  }
}
