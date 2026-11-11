import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { SendBookingConfirmedNotificationWorker } from '@bookings/application/notifications/send-booking-confirmed-notification.worker';

@Injectable()
export class NotificationWorkScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;

  public constructor(
    private readonly worker: SendBookingConfirmedNotificationWorker,
    @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig,
  ) {}

  public onApplicationBootstrap(): void {
    if (this.stopping) return;
    this.timer = setInterval(() => { void this.tick(); }, this.config.notificationPollIntervalMs);
    this.timer.unref();
    void this.tick();
  }

  public onApplicationShutdown(): void {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  public runOnce(): Promise<number> {
    return this.worker.runOnce(this.config.notificationBatchSize);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch {
      // Work remains durable and is reclaimed on the next interval or after the lease expires.
    } finally {
      this.running = false;
    }
  }
}
