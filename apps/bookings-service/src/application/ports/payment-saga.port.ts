import type { StoredBooking } from './create-booking.unit-of-work';

export interface ClaimedPaymentWork { id: string; bookingId: string; idempotencyKey: string; amount: string; currency: string; attempts: number; operation: 'CREATE_ORDER' | 'REQUEST_REFUND'; }
export interface PaymentWorkPort { claim(limit: number): Promise<ClaimedPaymentWork[]>; succeeded(id: string, paymentOrderId: string): Promise<void>; retry(id: string, attempts: number, code: string): Promise<void>; }
export interface BookingReaderPort { findById(id: string): Promise<StoredBooking | null>; }

export type PaymentFailureCode = 'INSUFFICIENT_FUNDS' | 'CARD_DECLINED' | 'SUSPECTED_FRAUD';
export type RefundFailureCode = 'CARD_DECLINED' | 'GATEWAY_UNAVAILABLE';
export type RefundReason = 'GUEST_CANCELLATION' | 'OWNER_CANCELLATION';

export interface PaymentEventBase {
  eventId: string;
  schemaVersion: 1;
  occurredAt: string;
  paymentId: string;
  bookingId: string;
  payerUserId: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentApprovedEvent extends PaymentEventBase { eventType: 'payment.v1.approved'; }
export interface PaymentDeclinedEvent extends PaymentEventBase { eventType: 'payment.v1.declined'; failureCode: PaymentFailureCode; }
export interface PaymentFailedEvent extends PaymentEventBase { eventType: 'payment.v1.failed'; failureCode: 'GATEWAY_UNAVAILABLE'; }
export interface PaymentReviewRequiredEvent extends PaymentEventBase { eventType: 'payment.v1.review_required'; reasonCode: 'RECONCILIATION_EXHAUSTED'; }

export interface RefundedEvent extends PaymentEventBase {
  eventType: 'payment.v1.refunded';
  refundId: string;
  refundedAmountMinor: number;
  totalRefundedAmountMinor: number;
  reason: RefundReason;
  paymentStatus: 'PARTIALLY_REFUNDED' | 'REFUNDED';
}
export interface RefundFailedEvent extends PaymentEventBase {
  eventType: 'payment.v1.refund_failed';
  refundId: string;
  reason: RefundReason;
  failureCode: RefundFailureCode;
}
export interface RefundReviewRequiredEvent extends PaymentEventBase {
  eventType: 'payment.v1.refund_review_required';
  refundId: string;
  reasonCode: 'RECONCILIATION_EXHAUSTED';
  refundAmountMinor: number;
}

export type PaymentResultEvent = PaymentApprovedEvent | PaymentDeclinedEvent | PaymentFailedEvent | PaymentReviewRequiredEvent;
export type RefundResultEvent = RefundedEvent | RefundFailedEvent | RefundReviewRequiredEvent;
export type PaymentEvent = PaymentResultEvent | RefundResultEvent;

export function isRefundResultEvent(event: PaymentEvent): event is RefundResultEvent {
  return event.eventType === 'payment.v1.refunded' || event.eventType === 'payment.v1.refund_failed' || event.eventType === 'payment.v1.refund_review_required';
}

export interface PaymentResultUnitOfWork { apply(event: PaymentResultEvent, hash: string): Promise<'APPLIED'|'DUPLICATE'>; }
export interface RefundResultUnitOfWork { apply(event: RefundResultEvent, hash: string): Promise<'APPLIED'|'DUPLICATE'>; }
export interface PaymentHoldExpiryPort { expire(limit: number): Promise<number>; }
