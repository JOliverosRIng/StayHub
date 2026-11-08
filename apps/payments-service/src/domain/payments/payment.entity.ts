import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import {
  assertPaymentCanBeDeclined,
  assertPaymentCanBeMarkedFailed,
  assertPaymentCanBeReviewed,
  getPaymentStatusAfterRefund,
  type PaymentFailureCode,
  type PreDispatchFailureEvidence,
} from './payment.policy';
import {
  assertPaymentStatusTransition,
  type PaymentStatus,
  type PaymentStatusEvidence,
} from './payment-status';

export interface CreatePaymentProps {
  readonly id: string;
  readonly amount: Money;
}

export class Payment {
  private currentStatus: PaymentStatus = 'PENDING';
  private currentRefundedAmount: Money;
  private currentFailureCode: PaymentFailureCode | null = null;

  private constructor(
    readonly id: string,
    readonly amount: Money,
  ) {
    this.currentRefundedAmount = Money.fromMinor(0, amount.currency);
  }

  static create(props: CreatePaymentProps): Payment {
    if (!props.id.trim()) {
      throw new DomainError('VALIDATION_ERROR', 'Payment id is required', [
        { field: 'id', message: 'Must not be empty' },
      ]);
    }
    if (props.amount.amountMinor <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Payment amount must be positive', [
        { field: 'amount', message: 'Must be greater than zero' },
      ]);
    }
    return new Payment(props.id, props.amount);
  }

  get status(): PaymentStatus {
    return this.currentStatus;
  }

  get refundedAmount(): Money {
    return this.currentRefundedAmount;
  }

  get failureCode(): PaymentFailureCode | null {
    return this.currentFailureCode;
  }

  approve(evidence: PaymentStatusEvidence): void {
    assertPaymentStatusTransition(this.currentStatus, 'APPROVED', evidence);
    this.currentStatus = 'APPROVED';
    this.currentFailureCode = null;
  }

  decline(failureCode: PaymentFailureCode, evidence: PaymentStatusEvidence): void {
    assertPaymentCanBeDeclined(this.currentStatus, failureCode, evidence);
    this.currentStatus = 'DECLINED';
    this.currentFailureCode = failureCode;
  }

  markFailed(evidence: PreDispatchFailureEvidence): void {
    assertPaymentCanBeMarkedFailed(this.currentStatus, evidence);
    this.currentStatus = 'FAILED';
    this.currentFailureCode = 'GATEWAY_UNAVAILABLE';
  }

  markReviewRequired(evidence: PaymentStatusEvidence): void {
    assertPaymentCanBeReviewed(this.currentStatus, evidence);
    this.currentStatus = 'REVIEW_REQUIRED';
    this.currentFailureCode = 'RECONCILIATION_EXHAUSTED';
  }

  applyRefund(amount: Money, evidence: PaymentStatusEvidence): void {
    const result = getPaymentStatusAfterRefund(
      this.currentStatus,
      amount,
      this.currentRefundedAmount,
      this.amount,
      evidence,
    );
    this.currentRefundedAmount = result.refundedAmount;
    this.currentStatus = result.status;
  }
}
