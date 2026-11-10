import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import type { PaymentStatusEvidence } from '../payments/payment-status';

export const REFUND_REASONS = ['GUEST_CANCELLATION', 'OWNER_CANCELLATION'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_STATUSES = ['PENDING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface RefundStatusTransition {
  readonly from: RefundStatus;
  readonly to: RefundStatus;
  /** Pass to the audit adapter, which must persist only a keyed hash of the reference. */
  readonly evidence: PaymentStatusEvidence;
}

const ALLOWED_REFUND_TRANSITIONS: Readonly<Record<RefundStatus, readonly RefundStatus[]>> = {
  PENDING: ['COMPLETED', 'FAILED', 'REVIEW_REQUIRED'],
  REVIEW_REQUIRED: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function calculateRefundAmount(
  paymentStatus: string,
  paymentAmount: Money,
  refundedAmount: Money,
  reason: RefundReason,
  requestedAmount?: Money,
): Money {
  if (!REFUND_REASONS.includes(reason)) {
    throw new DomainError('VALIDATION_ERROR', 'Unsupported refund reason', [
      { field: 'reason', message: 'Must be GUEST_CANCELLATION or OWNER_CANCELLATION' },
    ]);
  }
  if (paymentStatus !== 'APPROVED' && paymentStatus !== 'PARTIALLY_REFUNDED') {
    throw new DomainError('STATE_CONFLICT', 'Payment is not in a refundable state');
  }
  if (paymentAmount.currency !== refundedAmount.currency) {
    throw new DomainError('REFUND_AMOUNT_INVALID', 'Refund balance currency differs from payment currency');
  }

  let remaining: Money;
  try {
    remaining = paymentAmount.subtract(refundedAmount);
  } catch {
    throw new DomainError('REFUND_AMOUNT_INVALID', 'Refunded amount exceeds payment amount');
  }
  if (remaining.amountMinor <= 0) {
    throw new DomainError('REFUND_AMOUNT_INVALID', 'Payment has no refundable balance');
  }

  const amount = requestedAmount ?? remaining;
  if (amount.currency !== paymentAmount.currency || amount.amountMinor <= 0 || amount.compare(remaining) > 0) {
    throw new DomainError('REFUND_AMOUNT_INVALID', 'Refund amount must be positive and no greater than the balance');
  }
  if (reason === 'OWNER_CANCELLATION' && amount.compare(remaining) !== 0) {
    throw new DomainError('REFUND_AMOUNT_INVALID', 'Owner cancellation requires a full refund of the remaining balance');
  }
  return amount;
}

export function canTransitionRefundStatus(
  current: RefundStatus,
  next: RefundStatus,
  evidence?: PaymentStatusEvidence,
): boolean {
  const hasEvidence =
    typeof evidence?.source === 'string' && evidence.source.trim().length > 0 &&
    typeof evidence.reference === 'string' && evidence.reference.trim().length > 0;
  return hasEvidence && ALLOWED_REFUND_TRANSITIONS[current].includes(next);
}

export function assertRefundStatusTransition(
  current: RefundStatus,
  next: RefundStatus,
  evidence?: PaymentStatusEvidence,
): RefundStatusTransition {
  if (!evidence || !canTransitionRefundStatus(current, next, evidence)) {
    throw new DomainError('STATE_CONFLICT', `Refund cannot transition from ${current} to ${next} without evidence`);
  }
  return { from: current, to: next, evidence: { source: evidence.source, reference: evidence.reference } };
}
