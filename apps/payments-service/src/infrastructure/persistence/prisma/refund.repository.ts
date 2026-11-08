import { createHash, randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/shared/domain-error';
import { Money, type Currency } from '../../../domain/shared/money';
import { Refund, type RefundFailureCode } from '../../../domain/refunds/refund.entity';
import type { RefundReason, RefundStatus } from '../../../domain/refunds/refund.policy';
import type { LockedRefundPayment, RefundPersistenceMetadata, RefundRepository } from '../../../application/ports/refund.repository';
import { Prisma, type Prisma as PrismaTypes } from '../generated/client';
import { PrismaPaymentRepository } from './payment.repository';

type RefundRow = PrismaTypes.RefundGetPayload<Record<string, never>>;
const REFUND_FAILURE_CODES = new Set<RefundFailureCode>([
  'GATEWAY_UNAVAILABLE', 'CARD_DECLINED', 'GATEWAY_TIMEOUT', 'RECONCILIATION_EXHAUSTED',
]);

function supportedCurrency(value: string): Currency {
  const currency = value.trim();
  if (currency !== 'COP' && currency !== 'USD') throw new DomainError('STATE_CONFLICT', 'Persisted refund currency is unsupported');
  return currency;
}

function mapRefund(row: RefundRow): Refund {
  if (row.failureCode !== null && !REFUND_FAILURE_CODES.has(row.failureCode as RefundFailureCode)) {
    throw new DomainError('STATE_CONFLICT', 'Persisted refund failure code is unsupported');
  }
  const amountMinor = Number(row.amountMinor);
  if (!Number.isSafeInteger(amountMinor)) throw new DomainError('STATE_CONFLICT', 'Persisted refund amount exceeds the safe integer range');
  const currency = supportedCurrency(row.currency);
  return Refund.reconstitute({
    id: row.id,
    paymentId: row.paymentId,
    paymentStatus: 'APPROVED',
    paymentAmount: Money.fromMinor(amountMinor, currency),
    refundedAmount: Money.fromMinor(0, currency),
    requestedAmount: Money.fromMinor(amountMinor, currency),
    reason: row.reason as RefundReason,
    status: row.status as RefundStatus,
    failureCode: row.failureCode as RefundFailureCode | null,
  });
}

/** Transaction-scoped refund persistence; lockPaymentForRefund must run before balance validation. */
export class PrismaRefundRepository implements RefundRepository {
  constructor(private readonly prisma: PrismaTypes.TransactionClient) {}

  async findById(id: string): Promise<Refund | null> {
    const row = await this.prisma.refund.findUnique({ where: { id } });
    return row ? mapRefund(row) : null;
  }

  async findInFlightByPaymentId(paymentId: string): Promise<Refund | null> {
    const row = await this.prisma.refund.findFirst({
      where: { paymentId, status: { in: ['PENDING', 'REVIEW_REQUIRED'] } },
      orderBy: { createdAt: 'desc' },
    });
    return row ? mapRefund(row) : null;
  }

  async lockPaymentForRefund(paymentId: string): Promise<LockedRefundPayment | null> {
    const locked = await this.prisma.$queryRaw<Array<{ id: string; gateway_reference: string | null }>>`
      SELECT id, gateway_reference FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE
    `;
    if (!locked.length) return null;
    const payment = await new PrismaPaymentRepository(this.prisma).findById(paymentId);
    return payment ? { payment, gatewayReference: locked[0]!.gateway_reference?.trim() ?? null } : null;
  }

  async save(refund: Refund, metadata: RefundPersistenceMetadata = {}): Promise<void> {
    try {
      await this.persist(refund, metadata);
    } catch (error) {
      throw mapRefundPersistenceError(error);
    }
  }

  private async persist(refund: Refund, metadata: RefundPersistenceMetadata): Promise<void> {
    const previous = await this.prisma.refund.findUnique({ where: { id: refund.id } });
    const common = {
      paymentId: refund.paymentId,
      amountMinor: BigInt(refund.amount.amountMinor),
      currency: refund.amount.currency,
      reason: refund.reason,
      status: refund.status,
      failureCode: refund.failureCode,
      ...(metadata.gatewayReference !== undefined ? { gatewayReference: metadata.gatewayReference } : {}),
      ...(metadata.nextReconcileAt !== undefined ? { nextReconcileAt: metadata.nextReconcileAt } : {}),
      ...(metadata.reconcileAttempts !== undefined ? { reconcileAttempts: metadata.reconcileAttempts } : {}),
    };
    if (!previous) {
      if (refund.status !== 'PENDING') throw new DomainError('STATE_CONFLICT', 'A refund must be created as PENDING');
      await this.prisma.refund.create({ data: { id: refund.id, ...common } });
      await this.prisma.refundStatusHistory.create({
        data: {
          id: randomUUID(),
          refundId: refund.id,
          fromStatus: null,
          toStatus: 'PENDING',
          reasonCode: metadata.reasonCode ?? 'REFUND_CREATED',
          actor: metadata.actor ?? 'bookings-service',
        },
      });
      return;
    }
    if (
      previous.paymentId !== refund.paymentId || previous.amountMinor !== BigInt(refund.amount.amountMinor) ||
      previous.currency.trim() !== refund.amount.currency || previous.reason !== refund.reason
    ) {
      throw new DomainError('STATE_CONFLICT', 'Immutable refund details cannot be changed');
    }
    const changed = await this.prisma.refund.updateMany({
      where: { id: refund.id, status: previous.status },
      data: common,
    });
    if (changed.count !== 1) throw new DomainError('STATE_CONFLICT', 'Refund was concurrently modified');
    if (previous.status !== refund.status) {
      await this.prisma.refundStatusHistory.create({
        data: {
          id: randomUUID(),
          refundId: refund.id,
          fromStatus: previous.status,
          toStatus: refund.status,
          reasonCode: metadata.reasonCode ?? refund.failureCode ?? `REFUND_${refund.status}`,
          actor: metadata.actor ?? 'payments-service',
          ...(metadata.evidenceReference
            ? { evidenceRefHash: createHash('sha256').update(metadata.evidenceReference, 'utf8').digest('hex') }
            : {}),
        },
      });
    }
  }
}

function mapRefundPersistenceError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.filter((field): field is string => typeof field === 'string')
      : typeof target === 'string' ? [target] : [];
    if (fields.some((field) => field.includes('refunds_one_inflight_per_payment_uq') || field.includes('payment_id'))) {
      return new DomainError('STATE_CONFLICT', 'A refund is already in flight for this payment');
    }
  }
  return error;
}
