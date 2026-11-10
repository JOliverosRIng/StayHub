import { DomainError } from '../../domain/shared/domain-error';
import type { PaymentStatus } from '../../domain/payments/payment-status';
import type { PaymentFailureCode } from '../../domain/payments/payment.policy';
import type { PaymentStatusReader } from '../ports/payment-status.reader';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaymentStatusPrincipal =
  | { readonly kind: 'user'; readonly sub: string; readonly role: 'GUEST' | 'OWNER' | 'ADMIN' }
  | { readonly kind: 'service'; readonly subject: string };

export interface GetPaymentStatusResponse {
  readonly paymentId: string;
  readonly bookingId: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: 'COP' | 'USD';
  readonly refundedAmountMinor: number;
  readonly failureCode: PaymentFailureCode | null;
  readonly updatedAt: string;
}

export class GetPaymentStatus {
  constructor(private readonly reader: PaymentStatusReader) {}

  async execute(paymentId: string, principal: PaymentStatusPrincipal): Promise<GetPaymentStatusResponse> {
    if (!UUID_PATTERN.test(paymentId)) throw new DomainError('VALIDATION_ERROR', 'Payment id must be a UUID');
    const record = await this.reader.findStatusById(paymentId);
    if (!record || (principal.kind === 'user' && principal.role !== 'ADMIN' && principal.sub !== record.payerUserId)) {
      throw new DomainError('NOT_FOUND', 'Payment was not found');
    }
    return {
      paymentId: record.paymentId,
      bookingId: record.bookingId,
      status: record.status,
      amountMinor: record.amountMinor,
      currency: record.currency,
      refundedAmountMinor: record.refundedAmountMinor,
      failureCode: record.failureCode,
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
