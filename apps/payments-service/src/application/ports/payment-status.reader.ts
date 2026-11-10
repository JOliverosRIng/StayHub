import type { PaymentFailureCode } from '../../domain/payments/payment.policy';
import type { PaymentStatus } from '../../domain/payments/payment-status';

export interface PaymentStatusRecord {
  readonly paymentId: string;
  readonly bookingId: string;
  readonly payerUserId: string;
  readonly amountMinor: number;
  readonly currency: 'COP' | 'USD';
  readonly status: PaymentStatus;
  readonly refundedAmountMinor: number;
  readonly failureCode: PaymentFailureCode | null;
  readonly updatedAt: Date;
}

export interface PaymentStatusReader {
  findStatusById(paymentId: string): Promise<PaymentStatusRecord | null>;
}
