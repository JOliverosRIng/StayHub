import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ReconcilePending } from '../application/payments/reconcile-pending.use-case';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../infrastructure/config/payments-config';
import { Inject } from '@nestjs/common';

@Injectable()
export class ReconcilerScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ReconcilerScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly reconcilePending: ReconcilePending,
    @Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.tick(); }, this.config.reconcilerIntervalMs);
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcilePending.execute();
    } catch (error) {
      this.logger.error('Payment reconciliation iteration failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }
}
