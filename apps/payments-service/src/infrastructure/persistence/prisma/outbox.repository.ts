import type { OutboxRepository, NewOutboxEvent } from '../../../application/ports/outbox.repository';
import { DomainError } from '../../../domain/shared/domain-error';
import type { Prisma } from '../generated/client';

const SUPPORTED_EVENTS = new Set([
  'payment.v1.approved',
  'payment.v1.declined',
  'payment.v1.failed',
  'payment.v1.refunded',
  'payment.v1.refund_failed',
  'payment.v1.review_required',
  'payment.v1.refund_review_required',
]);

export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  async append(event: NewOutboxEvent): Promise<void> {
    if (!SUPPORTED_EVENTS.has(event.eventType)) throw new DomainError('VALIDATION_ERROR', 'Unsupported payments outbox event type');
    await this.prisma.outboxEvent.create({
      data: {
        id: event.id,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonObject,
      },
    });
  }
}
