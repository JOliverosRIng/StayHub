import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { DomainError } from '../../../domain/shared/domain-error';
import { Money, type Currency } from '../../../domain/shared/money';
import { Payment } from '../../../domain/payments/payment.entity';
import type { PaymentFailureCode } from '../../../domain/payments/payment.policy';
import type { PaymentStatus } from '../../../domain/payments/payment-status';
import type { PaymentPersistenceMetadata, PaymentRepository } from '../../../application/ports/payment.repository';
import { Prisma, type Prisma as PrismaTypes } from '../generated/client';

const ACTIVE_STATUSES = ['PENDING', 'REVIEW_REQUIRED', 'APPROVED', 'PARTIALLY_REFUNDED'] as const;
const FAILURE_CODES = new Set<PaymentFailureCode>([
  'INSUFFICIENT_FUNDS', 'CARD_DECLINED', 'SUSPECTED_FRAUD', 'GATEWAY_UNAVAILABLE',
  'GATEWAY_TIMEOUT', 'RECONCILIATION_EXHAUSTED',
]);

type PaymentRow = PrismaTypes.PaymentGetPayload<Record<string, never>>;

function currency(value: string): Currency {
  if (value !== 'COP' && value !== 'USD') throw new DomainError('STATE_CONFLICT', 'Persisted payment currency is unsupported');
  return value;
}

function failureCode(value: string | null): PaymentFailureCode | null {
  if (value === null) return null;
  if (!FAILURE_CODES.has(value as PaymentFailureCode)) throw new DomainError('STATE_CONFLICT', 'Persisted payment failure code is unsupported');
  return value as PaymentFailureCode;
}

function toDomain(row: PaymentRow): Payment {
  const supportedCurrency = currency(row.currency.trim());
  const amountMinor = Number(row.amountMinor);
  const refundedAmountMinor = Number(row.refundedAmountMinor);
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(refundedAmountMinor)) {
    throw new DomainError('STATE_CONFLICT', 'Persisted payment amount exceeds the safe integer range');
  }
  return Payment.reconstitute({
    id: row.id,
    bookingId: row.bookingId,
    payerUserId: row.payerUserId,
    paymentMethodFingerprint: row.paymentMethodFingerprint.trim(),
    amount: Money.fromMinor(amountMinor, supportedCurrency),
    refundedAmount: Money.fromMinor(refundedAmountMinor, supportedCurrency),
    status: row.status as PaymentStatus,
    failureCode: failureCode(row.failureCode),
  });
}

/** Transaction-scoped adapter: pass Prisma.TransactionClient from PrismaUnitOfWork. */
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaTypes.TransactionClient) {}

  async findById(id: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findActiveByBookingId(bookingId: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findFirst({
      where: { bookingId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toDomain(row) : null;
  }

  async save(payment: Payment, metadata: PaymentPersistenceMetadata = {}): Promise<void> {
    try {
      await this.persist(payment, metadata);
    } catch (error) {
      throw mapPaymentPersistenceError(error);
    }
  }

  private async persist(payment: Payment, metadata: PaymentPersistenceMetadata): Promise<void> {
    const previous = await this.prisma.payment.findUnique({ where: { id: payment.id } });
    const common = {
      bookingId: payment.bookingId,
      payerUserId: payment.payerUserId,
      amountMinor: BigInt(payment.amount.amountMinor),
      currency: payment.amount.currency,
      status: payment.status,
      refundedAmountMinor: BigInt(payment.refundedAmount.amountMinor),
      failureCode: payment.failureCode,
      paymentMethodType: 'CARD_TOKEN',
      paymentMethodFingerprint: payment.paymentMethodFingerprint,
      ...(metadata.gatewayReference !== undefined ? { gatewayReference: metadata.gatewayReference } : {}),
      ...(metadata.nextReconcileAt !== undefined ? { nextReconcileAt: metadata.nextReconcileAt } : {}),
      ...(metadata.reconcileAttempts !== undefined ? { reconcileAttempts: metadata.reconcileAttempts } : {}),
    };

    if (!previous) {
      await this.prisma.payment.create({ data: { id: payment.id, ...common } });
      await this.prisma.paymentStatusHistory.create({
        data: {
          id: randomUUID(),
          paymentId: payment.id,
          fromStatus: null,
          toStatus: payment.status,
          reasonCode: 'PAYMENT_CREATED',
          actor: 'payments-service',
        },
      });
      return;
    }

    if (
      previous.bookingId !== payment.bookingId || previous.payerUserId !== payment.payerUserId ||
      previous.amountMinor !== BigInt(payment.amount.amountMinor) || previous.currency.trim() !== payment.amount.currency ||
      previous.paymentMethodFingerprint.trim() !== payment.paymentMethodFingerprint
    ) {
      throw new DomainError('STATE_CONFLICT', 'Immutable payment details cannot be changed');
    }

    const changed = await this.prisma.payment.updateMany({
      where: { id: payment.id, version: previous.version },
      data: { ...common, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new DomainError('STATE_CONFLICT', 'Payment was concurrently modified');

    if (previous.status !== payment.status) {
      await this.prisma.paymentStatusHistory.create({
        data: {
          id: randomUUID(),
          paymentId: payment.id,
          fromStatus: previous.status,
          toStatus: payment.status,
          reasonCode: payment.failureCode ?? `PAYMENT_${payment.status}`,
          actor: 'payments-service',
          ...(metadata.evidenceReference
            ? { evidenceRefHash: createHash('sha256').update(metadata.evidenceReference, 'utf8').digest('hex') }
            : {}),
        },
      });
    }
  }
}

export function mapPaymentPersistenceError(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
    if (fields.some((field) => field.includes('payments_active_booking_uq') || field.includes('booking_id'))) {
      return new DomainError('STATE_CONFLICT', 'An active payment already exists for this booking');
    }
  }
  return error;
}
