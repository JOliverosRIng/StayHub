import type { PendingOutboxEvent } from './outbox.repository';

export interface EventPublisherPort {
  publish(event: PendingOutboxEvent): Promise<void>;
  isHealthy(): boolean;
}
