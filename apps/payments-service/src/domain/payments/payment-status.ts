import { DomainError } from '../shared/domain-error';

export const PAYMENT_STATUSES = [
  'PENDING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'DECLINED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Evidence reference required to audit a status change. Never put secrets here. */
export interface PaymentStatusEvidence {
  readonly source: string;
  readonly reference: string;
}

const ALLOWED_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PENDING: ['APPROVED', 'DECLINED', 'FAILED', 'REVIEW_REQUIRED'],
  REVIEW_REQUIRED: ['APPROVED', 'DECLINED', 'FAILED'],
  APPROVED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  DECLINED: [],
  FAILED: [],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: [],
};

export function canTransitionPaymentStatus(
  current: PaymentStatus,
  next: PaymentStatus,
  evidence?: PaymentStatusEvidence,
): boolean {
  const hasEvidence =
    typeof evidence?.source === 'string' &&
    evidence.source.trim().length > 0 &&
    typeof evidence.reference === 'string' &&
    evidence.reference.trim().length > 0;
  return hasEvidence && ALLOWED_TRANSITIONS[current].includes(next);
}

export function assertPaymentStatusTransition(
  current: PaymentStatus,
  next: PaymentStatus,
  evidence?: PaymentStatusEvidence,
): void {
  if (!canTransitionPaymentStatus(current, next, evidence)) {
    throw new DomainError(
      'STATE_CONFLICT',
      `Payment cannot transition from ${current} to ${next} without valid evidence`,
    );
  }
}
