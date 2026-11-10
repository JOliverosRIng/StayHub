import type { ReconciliationClaim, ReconciliationRepository } from '../../../application/ports/reconciliation.repository';
import type { Prisma } from '../generated/client';

type ReconciliationPrismaClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export class PrismaReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly prisma: ReconciliationPrismaClient) {}

  async claimDueBatch(limit: number, leaseMs: number): Promise<readonly ReconciliationClaim[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(leaseMs) || leaseMs < 1) {
      throw new Error('Reconciliation claim limits must be positive integers');
    }
    const [payments, refunds] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; gatewayReference: string; attempts: number }>>`
        WITH candidates AS (
          SELECT id FROM payments
          WHERE status = 'PENDING'::payment_status
            AND next_reconcile_at <= now()
          ORDER BY next_reconcile_at, created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE payments payment
        SET reconcile_attempts = payment.reconcile_attempts + 1,
            next_reconcile_at = now() + (${leaseMs} * interval '1 millisecond')
        FROM candidates
        WHERE payment.id = candidates.id
        RETURNING payment.id, COALESCE(payment.gateway_reference, payment.id::text) AS "gatewayReference", payment.reconcile_attempts AS attempts
      `,
      this.prisma.$queryRaw<Array<{ id: string; paymentId: string; gatewayReference: string; attempts: number }>>`
        WITH candidates AS (
          SELECT id FROM refunds
          WHERE status = 'PENDING'::refund_status
            AND next_reconcile_at <= now()
          ORDER BY next_reconcile_at, created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE refunds refund
        SET reconcile_attempts = refund.reconcile_attempts + 1,
            next_reconcile_at = now() + (${leaseMs} * interval '1 millisecond')
        FROM candidates
        WHERE refund.id = candidates.id
        RETURNING refund.id, refund.payment_id AS "paymentId", COALESCE(refund.gateway_reference, refund.id::text) AS "gatewayReference", refund.reconcile_attempts AS attempts
      `,
    ]);
    return [
      ...payments.map((item) => ({ kind: 'payment' as const, ...item })),
      ...refunds.map((item) => ({ kind: 'refund' as const, ...item })),
    ];
  }

  async oldestPendingAgeSeconds(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ ageSeconds: number }>>`
      SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at))), 0)::float8 AS "ageSeconds"
      FROM (
        SELECT created_at FROM payments WHERE status = 'PENDING'::payment_status
        UNION ALL
        SELECT created_at FROM refunds WHERE status = 'PENDING'::refund_status
      ) pending_resources
    `;
    return Math.max(0, rows[0]?.ageSeconds ?? 0);
  }
}
