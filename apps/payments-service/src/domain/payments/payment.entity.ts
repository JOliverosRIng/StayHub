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
  readonly bookingId: string;
  readonly payerUserId: string;
  readonly paymentMethodFingerprint: string;
  readonly amount: Money;
}

export class Payment {
  private currentStatus: PaymentStatus = 'PENDING';
  private currentRefundedAmount: Money;
  private currentFailureCode: PaymentFailureCode | null = null;

  private constructor(
    readonly id: string,
    readonly bookingId: string,
    readonly payerUserId: string,
    readonly paymentMethodFingerprint: string,
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
    if (!props.bookingId.trim() || !props.payerUserId.trim()) {
      throw new DomainError('VALIDATION_ERROR', 'Payment booking and payer are required');
    }
    if (!/^[a-f0-9]{64}$/i.test(props.paymentMethodFingerprint)) {
      throw new DomainError('VALIDATION_ERROR', 'Payment method fingerprint is invalid');
    }
    if (props.amount.amountMinor <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'Payment amount must be positive', [
        { field: 'amount', message: 'Must be greater than zero' },
      ]);
    }
    return new Payment(props.id, props.bookingId, props.payerUserId, props.paymentMethodFingerprint, props.amount);
  }

  static reconstitute(props: CreatePaymentProps & {
    readonly status: PaymentStatus;
    readonly refundedAmount: Money;
    readonly failureCode: PaymentFailureCode | null;
  }): Payment {
    if (props.amount.currency !== props.refundedAmount.currency || props.refundedAmount.amountMinor > props.amount.amountMinor) {
      throw new DomainError('VALIDATION_ERROR', 'Persisted payment amounts are inconsistent');
    }
    const payment = Payment.create(props);
    payment.currentStatus = props.status;
    payment.currentRefundedAmount = props.refundedAmount;
    payment.currentFailureCode = props.failureCode;
    return payment;
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
