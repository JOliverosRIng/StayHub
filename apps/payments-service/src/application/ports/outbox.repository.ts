export interface NewOutboxEvent {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface PendingOutboxEvent extends NewOutboxEvent {
  readonly attempts: number;
}

export interface OutboxRepository {
  append(event: NewOutboxEvent): Promise<void>;
}

export interface OutboxRelayRepository extends OutboxRepository {
  claimDueBatch(limit: number, maxAttempts: number, leaseMs: number): Promise<readonly PendingOutboxEvent[]>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
  scheduleRetry(id: string, nextAttemptAt: Date, maxAttempts: number): Promise<void>;
  countByStatus(): Promise<{ readonly pending: number; readonly dead: number }>;
  purgePublished(before: Date, limit: number): Promise<number>;
}
