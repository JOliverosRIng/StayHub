export interface ScheduledReminder {
  id: string;
  bookingId: string;
  userId: string;
  roomTitle: string;
  roomLocation: string;
  checkIn: string;
}

export interface NewScheduledReminder extends Omit<ScheduledReminder, 'id'> {
  scheduledAt: Date;
}

export interface ReminderScheduleRepository {
  scheduleBookingReminder(reminder: NewScheduledReminder): Promise<void>;
  claimDueReminders(now: Date, staleBefore: Date, take: number): Promise<ScheduledReminder[]>;
  completeReminder(id: string, status: 'SENT' | 'FAILED'): Promise<void>;
}

export class ReminderScheduleConflictError extends Error {
  readonly code = 'BOOKING_REMINDER_CONFLICT';
}

export const REMINDER_SCHEDULE_REPOSITORY = Symbol('REMINDER_SCHEDULE_REPOSITORY');
