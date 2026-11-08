import { DomainError } from '../../../domain/shared/domain-error';
import type { PaymentFailureCode } from '../../../domain/payments/payment.policy';
import type { PaymentStatus } from '../../../domain/payments/payment-status';
import type { PaymentStatusReader, PaymentStatusRecord } from '../../../application/ports/payment-status.reader';
import { PrismaService } from './prisma.service';

const FAILURE_CODES = new Set<PaymentFailureCode>([
  'INSUFFICIENT_FUNDS', 'CARD_DECLINED', 'SUSPECTED_FRAUD', 'GATEWAY_UNAVAILABLE',
  'GATEWAY_TIMEOUT', 'RECONCILIATION_EXHAUSTED',
]);

export class PrismaPaymentStatusReader implements PaymentStatusReader {
  constructor(private readonly prisma: PrismaService) {}

  async findStatusById(paymentId: string): Promise<PaymentStatusRecord | null> {
    const row = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        bookingId: true,
        payerUserId: true,
        amountMinor: true,
        currency: true,
        status: true,
        refundedAmountMinor: true,
        failureCode: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    const amountMinor = Number(row.amountMinor);
    const refundedAmountMinor = Number(row.refundedAmountMinor);
    if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(refundedAmountMinor)) {
      throw new DomainError('STATE_CONFLICT', 'Persisted payment amount exceeds the safe integer range');
    }
    if (row.currency.trim() !== 'COP' && row.currency.trim() !== 'USD') {
      throw new DomainError('STATE_CONFLICT', 'Persisted payment currency is unsupported');
    }
    if (row.failureCode !== null && !FAILURE_CODES.has(row.failureCode as PaymentFailureCode)) {
      throw new DomainError('STATE_CONFLICT', 'Persisted payment failure code is unsupported');
    }
    return {
      paymentId: row.id,
      bookingId: row.bookingId,
      payerUserId: row.payerUserId,
      amountMinor,
      currency: row.currency.trim() as 'COP' | 'USD',
      status: row.status as PaymentStatus,
      refundedAmountMinor,
      failureCode: row.failureCode as PaymentFailureCode | null,
      updatedAt: row.updatedAt,
    };
  }
}
