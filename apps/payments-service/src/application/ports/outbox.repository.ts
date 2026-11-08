export interface NewOutboxEvent {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface OutboxRepository {
  append(event: NewOutboxEvent): Promise<void>;
}
