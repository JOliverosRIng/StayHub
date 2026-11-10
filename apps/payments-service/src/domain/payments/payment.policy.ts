import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import type { PaymentStatus, PaymentStatusEvidence } from './payment-status';
import { assertPaymentStatusTransition } from './payment-status';

export type PaymentFailureCode =
  | 'INSUFFICIENT_FUNDS'
  | 'CARD_DECLINED'
  | 'SUSPECTED_FRAUD'
  | 'GATEWAY_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT'
  | 'RECONCILIATION_EXHAUSTED';

export interface PreDispatchFailureEvidence extends PaymentStatusEvidence {
  readonly dispatch: 'NOT_DISPATCHED';
}

const DECLINE_CODES = new Set<PaymentFailureCode>([
  'INSUFFICIENT_FUNDS',
  'CARD_DECLINED',
  'SUSPECTED_FRAUD',
]);

export function assertPaymentCanBeDeclined(
  current: PaymentStatus,
  failureCode: PaymentFailureCode,
  evidence: PaymentStatusEvidence,
): void {
  if (!DECLINE_CODES.has(failureCode)) {
    throw new DomainError('VALIDATION_ERROR', 'Decline requires a definitive decline code');
  }
  assertPaymentStatusTransition(current, 'DECLINED', evidence);
}

export function assertPaymentCanBeMarkedFailed(
  current: PaymentStatus,
  evidence: PreDispatchFailureEvidence,
): void {
  if (evidence?.dispatch !== 'NOT_DISPATCHED') {
    throw new DomainError('STATE_CONFLICT', 'FAILED requires proof that the charge was not dispatched');
  }
  assertPaymentStatusTransition(current, 'FAILED', evidence);
}

export function assertPaymentCanBeReviewed(
  current: PaymentStatus,
  evidence: PaymentStatusEvidence,
): void {
  assertPaymentStatusTransition(current, 'REVIEW_REQUIRED', evidence);
}

export function getPaymentStatusAfterRefund(
  currentStatus: PaymentStatus,
  amount: Money,
  refundedAmount: Money,
  paymentAmount: Money,
  evidence: PaymentStatusEvidence,
): { readonly status: PaymentStatus; readonly refundedAmount: Money } {
  if (currentStatus !== 'APPROVED' && currentStatus !== 'PARTIALLY_REFUNDED') {
    throw new DomainError('STATE_CONFLICT', 'Only an approved payment can be refunded');
  }
  if (amount.currency !== paymentAmount.currency || amount.amountMinor <= 0) {
    throw new DomainError('REFUND_AMOUNT_INVALID', 'Refund amount must be positive and use the payment currency');
  }

  let updatedRefundedAmount: Money;
  try {
    updatedRefundedAmount = refundedAmount.add(amount);
    if (updatedRefundedAmount.compare(paymentAmount) > 0) {
      throw new DomainError('REFUND_AMOUNT_INVALID', 'Refund amount exceeds the remaining refundable balance');
    }
  } catch (error) {
    if (error instanceof DomainError && error.code === 'REFUND_AMOUNT_INVALID') throw error;
    throw new DomainError('REFUND_AMOUNT_INVALID', 'Refund amount exceeds the remaining refundable balance');
  }

  const nextStatus: PaymentStatus =
    updatedRefundedAmount.compare(paymentAmount) === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  assertPaymentStatusTransition(currentStatus, nextStatus, evidence);
  return { status: nextStatus, refundedAmount: updatedRefundedAmount };
}
