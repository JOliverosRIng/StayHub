import type { EventPublisherPort } from '../ports/event-publisher.port';
import type { OutboxRelayRepository } from '../ports/outbox.repository';

export interface PublishOutboxConfig {
  readonly batchSize: number;
  readonly maxAttempts: number;
  readonly leaseMs: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
}

export class PublishOutbox {
  constructor(
    private readonly repository: OutboxRelayRepository,
    private readonly publisher: EventPublisherPort,
    private readonly config: PublishOutboxConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<number> {
    const events = await this.repository.claimDueBatch(
      this.config.batchSize,
      this.config.maxAttempts,
      this.config.leaseMs,
    );
    for (const event of events) {
      try {
        await this.publisher.publish(event);
        await this.repository.markPublished(event.id, this.now());
      } catch {
        const backoff = Math.min(this.config.retryBaseMs * 2 ** Math.max(0, event.attempts - 1), this.config.retryMaxMs);
        await this.repository.scheduleRetry(event.id, new Date(this.now().getTime() + backoff), this.config.maxAttempts);
      }
    }
    return events.length;
  }
}
