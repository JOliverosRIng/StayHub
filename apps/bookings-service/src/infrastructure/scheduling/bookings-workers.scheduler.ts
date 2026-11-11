import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { OutboxPort } from '@bookings/application/ports/outbox.port';
import { OUTBOX_PORT } from '@bookings/application/ports/outbox.port';
import { CreatePaymentOrderWorker } from '@bookings/application/payments/create-payment-order.worker';
import { ExpirePaymentHoldsWorker } from '@bookings/application/payments/expire-payment-holds.worker';
import { RequestRefundWorker } from '@bookings/application/payments/request-refund.worker';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';

@Injectable()
export class BookingsWorkersScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;

  public constructor(
    @Inject(OUTBOX_PORT) private readonly outbox: OutboxPort,
    private readonly orders: CreatePaymentOrderWorker,
    private readonly refunds: RequestRefundWorker,
    private readonly expiry: ExpirePaymentHoldsWorker,
    @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig,
  ) {}

  public onApplicationBootstrap(): void {
    if (this.stopping) return;
    this.timer = setInterval(() => { void this.tick(); }, this.config.workerPollIntervalMs);
    this.timer.unref();
    void this.tick();
  }

  public onApplicationShutdown(): void {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  public async runOnce(): Promise<void> {
    await Promise.allSettled([
      this.outbox.publishBatch(this.config.outboxBatchSize),
      this.expiry.runOnce(this.config.workerBatchSize),
      this.orders.runOnce(this.config.workerBatchSize),
      this.refunds.runOnce(this.config.workerBatchSize),
    ]);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      await this.runOnce();
    } finally {
      this.running = false;
    }
  }
}
