import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PublishOutbox } from '../../application/events/publish-outbox.use-case';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../config/payments-config';
import { OUTBOX_REPOSITORY } from './outbox.tokens';
import type { OutboxRelayRepository } from '../../application/ports/outbox.repository';

@Injectable()
export class OutboxRelay implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private nextRetentionPurgeAt = 0;

  constructor(
    private readonly publishOutbox: PublishOutbox,
    @Inject(OUTBOX_REPOSITORY) private readonly repository: OutboxRelayRepository,
    @Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.rabbitmqUrl) return;
    this.timer = setInterval(() => { void this.tick(); }, this.config.outboxPollIntervalMs);
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running || !this.config.rabbitmqUrl) return;
    this.running = true;
    try {
      await this.publishOutbox.execute();
      await this.purgeExpiredPublished();
    } catch (error) {
      this.logger.error('Outbox relay iteration failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  private async purgeExpiredPublished(): Promise<void> {
    const now = Date.now();
    if (now < this.nextRetentionPurgeAt) return;
    const before = new Date(now - this.config.outboxRetentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;
    for (let batch = 0; batch < 10; batch += 1) {
      const count = await this.repository.purgePublished(before, this.config.outboxBatchSize);
      deleted += count;
      if (count < this.config.outboxBatchSize) break;
    }
    this.nextRetentionPurgeAt = now + (deleted >= this.config.outboxBatchSize * 10 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
  }
}
