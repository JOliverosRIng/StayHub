import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { REMINDER_SCHEDULE_REPOSITORY, type ReminderScheduleRepository } from '../../application/ports/reminder-schedule.repository';
import { SendNotificationUseCase } from '../../application/notifications/send-notification.use-case';

const POLL_INTERVAL_MS = 30_000;
const CLAIM_LEASE_MS = 5 * 60_000;
const BATCH_SIZE = 25;

@Injectable()
export class CheckinReminderScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(REMINDER_SCHEDULE_REPOSITORY) private readonly reminders: ReminderScheduleRepository,
    private readonly sendNotification: SendNotificationUseCase,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => { void this.processDueReminders(); }, POLL_INTERVAL_MS);
    this.timer.unref();
    void this.processDueReminders();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processDueReminders(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const now = new Date();
    try {
      const due = await this.reminders.claimDueReminders(now, new Date(now.getTime() - CLAIM_LEASE_MS), BATCH_SIZE);
      for (const reminder of due) {
        try {
          const result = await this.sendNotification.execute({
            userId: reminder.userId,
            type: 'CHECKIN_REMINDER',
            channel: 'IN_APP',
            templateData: {
              bookingId: reminder.bookingId,
              propertyName: reminder.propertyName,
              roomName: reminder.roomName,
              checkIn: reminder.checkIn,
            },
            idempotencyKey: `checkin-reminder:${reminder.bookingId}`,
          });
          await this.reminders.completeReminder(reminder.id, result.notification.status === 'SENT' ? 'SENT' : 'FAILED');
        } catch {
          try { await this.reminders.completeReminder(reminder.id, 'FAILED'); } catch { /* Keep the lease; it will be reclaimed after expiry. */ }
        }
      }
    } catch {
      // Poll failures are retried on the next interval and never log notification data.
    } finally {
      this.running = false;
    }
  }
}
