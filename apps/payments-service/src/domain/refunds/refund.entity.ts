import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import type { PaymentStatus, PaymentStatusEvidence } from '../payments/payment-status';
import {
  assertRefundStatusTransition,
  calculateRefundAmount,
  type RefundReason,
  type RefundStatus,
  type RefundStatusTransition,
} from './refund.policy';

export interface CreateRefundProps {
  readonly id: string;
  readonly paymentId: string;
  readonly paymentStatus: PaymentStatus;
  readonly paymentAmount: Money;
  readonly refundedAmount: Money;
  readonly reason: RefundReason;
  readonly requestedAmount?: Money;
}

export type RefundFailureCode = 'GATEWAY_UNAVAILABLE' | 'CARD_DECLINED' | 'GATEWAY_TIMEOUT' | 'RECONCILIATION_EXHAUSTED';

export class Refund {
  private currentStatus: RefundStatus = 'PENDING';
  private currentFailureCode: RefundFailureCode | null = null;

  private constructor(
    readonly id: string,
    readonly paymentId: string,
    readonly amount: Money,
    readonly reason: RefundReason,
  ) {}

  static create(props: CreateRefundProps): Refund {
    if (!props.id.trim() || !props.paymentId.trim()) {
      throw new DomainError('VALIDATION_ERROR', 'Refund and payment ids are required');
    }
    const amount = calculateRefundAmount(
      props.paymentStatus,
      props.paymentAmount,
      props.refundedAmount,
      props.reason,
      props.requestedAmount,
    );
    return new Refund(props.id, props.paymentId, amount, props.reason);
  }

  static reconstitute(props: CreateRefundProps & {
    readonly status: RefundStatus;
    readonly failureCode: RefundFailureCode | null;
  }): Refund {
    const refund = Refund.create(props);
    const evidence = { source: 'persistence', reference: 'persisted-refund-state' };
    if (props.status === 'COMPLETED') refund.complete(evidence);
    else if (props.status === 'FAILED') {
      if (props.failureCode !== 'GATEWAY_UNAVAILABLE' && props.failureCode !== 'CARD_DECLINED') {
        throw new DomainError('STATE_CONFLICT', 'Persisted failed refund has an unsupported failure code');
      }
      refund.fail(props.failureCode, evidence);
    } else if (props.status === 'REVIEW_REQUIRED') refund.markReviewRequired(evidence);
    else if (props.status === 'PENDING' && props.failureCode === 'GATEWAY_TIMEOUT') refund.markUncertain(evidence);
    if (props.status === 'PENDING' && props.failureCode !== null && props.failureCode !== 'GATEWAY_TIMEOUT') {
      throw new DomainError('STATE_CONFLICT', 'Persisted pending refund failure code is unsupported');
    }
    return refund;
  }

  get status(): RefundStatus {
    return this.currentStatus;
  }

  get failureCode(): RefundFailureCode | null {
    return this.currentFailureCode;
  }

  complete(evidence: PaymentStatusEvidence): RefundStatusTransition {
    const transition = assertRefundStatusTransition(this.currentStatus, 'COMPLETED', evidence);
    this.currentStatus = 'COMPLETED';
    this.currentFailureCode = null;
    return transition;
  }

  fail(failureCode: RefundFailureCode, evidence: PaymentStatusEvidence): RefundStatusTransition {
    if (failureCode !== 'GATEWAY_UNAVAILABLE' && failureCode !== 'CARD_DECLINED') {
      throw new DomainError('VALIDATION_ERROR', 'Unsupported refund failure code');
    }
    const transition = assertRefundStatusTransition(this.currentStatus, 'FAILED', evidence);
    this.currentStatus = 'FAILED';
    this.currentFailureCode = failureCode;
    return transition;
  }

  markReviewRequired(evidence: PaymentStatusEvidence): RefundStatusTransition {
    const transition = assertRefundStatusTransition(this.currentStatus, 'REVIEW_REQUIRED', evidence);
    this.currentStatus = 'REVIEW_REQUIRED';
    this.currentFailureCode = 'RECONCILIATION_EXHAUSTED';
    return transition;
  }

  markUncertain(evidence: PaymentStatusEvidence): void {
    if (this.currentStatus !== 'PENDING' || !evidence.source.trim() || !evidence.reference.trim()) {
      throw new DomainError('STATE_CONFLICT', 'Only a pending refund can record an uncertain gateway result');
    }
    this.currentFailureCode = 'GATEWAY_TIMEOUT';
  }
}
