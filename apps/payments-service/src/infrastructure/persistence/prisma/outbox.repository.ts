import type { OutboxRelayRepository, NewOutboxEvent, PendingOutboxEvent } from '../../../application/ports/outbox.repository';
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

export class PrismaOutboxRepository implements OutboxRelayRepository {
  constructor(private readonly prisma: Pick<Prisma.TransactionClient, 'outboxEvent' | '$queryRaw' | '$executeRaw'>) {}

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

  async claimDueBatch(limit: number, maxAttempts: number, leaseMs: number): Promise<readonly PendingOutboxEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || !Number.isSafeInteger(leaseMs) || leaseMs < 1) {
      throw new DomainError('VALIDATION_ERROR', 'Outbox claim limits must be positive integers');
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string; aggregate_id: string; event_type: string; payload: Record<string, unknown>; attempts: number }>>`
      WITH exhausted AS (
        UPDATE outbox_events SET status = 'DEAD'::outbox_status
        WHERE status = 'PENDING'::outbox_status AND attempts >= ${maxAttempts} AND next_attempt_at <= now()
        RETURNING id
      ), candidates AS (
        SELECT current.id
        FROM outbox_events current
        WHERE current.status = 'PENDING'::outbox_status
          AND current.attempts < ${maxAttempts}
          AND current.next_attempt_at <= now()
          AND NOT EXISTS (
            SELECT 1 FROM outbox_events prior
            WHERE prior.aggregate_id = current.aggregate_id
              AND prior.status <> 'PUBLISHED'::outbox_status
              AND (prior.created_at, prior.id) < (current.created_at, current.id)
          )
        ORDER BY current.created_at, current.id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE outbox_events event
      SET attempts = event.attempts + 1,
          next_attempt_at = now() + (${leaseMs} * interval '1 millisecond')
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id, event.aggregate_id, event.event_type, event.payload, event.attempts
    `;
    return rows.map((row) => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.prisma.outboxEvent.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt } });
  }

  async scheduleRetry(id: string, nextAttemptAt: Date, maxAttempts: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'DEAD'::outbox_status ELSE 'PENDING'::outbox_status END,
          next_attempt_at = ${nextAttemptAt}
      WHERE id = ${id}::uuid AND status = 'PENDING'::outbox_status
    `;
  }

  async countByStatus(): Promise<{ readonly pending: number; readonly dead: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ pending: bigint; dead: bigint }>>`
      SELECT count(*) FILTER (WHERE status = 'PENDING'::outbox_status) AS pending,
             count(*) FILTER (WHERE status = 'DEAD'::outbox_status) AS dead
      FROM outbox_events
    `;
    return { pending: Number(rows[0]?.pending ?? 0), dead: Number(rows[0]?.dead ?? 0) };
  }

  async purgePublished(before: Date, limit: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH doomed AS (
        SELECT id FROM outbox_events
        WHERE status = 'PUBLISHED'::outbox_status AND published_at < ${before}
        ORDER BY published_at, id
        FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      DELETE FROM outbox_events event USING doomed WHERE event.id = doomed.id RETURNING event.id
    `;
    return rows.length;
  }
}
