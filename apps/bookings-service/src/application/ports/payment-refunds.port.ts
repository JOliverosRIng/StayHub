import type { ClaimedPaymentWork } from './payment-saga.port';

export interface RequestRefundCommand {
  bookingId: string;
  paymentOrderId: string;
  amount: string;
  mode: 'POLICY' | 'FULL';
  policyVersion?: string;
}

export interface PaymentRefundsPort {
  requestRefund(command: RequestRefundCommand, idempotencyKey: string): Promise<{ refundId: string; status: 'PENDING' | 'COMPLETED' | 'FAILED' }>;
}

export const PAYMENT_REFUNDS_PORT = Symbol('PAYMENT_REFUNDS_PORT');

export interface RefundWorkPort {
  claim(limit: number, operation: 'REQUEST_REFUND'): Promise<ClaimedPaymentWork[]>;
  succeededRefund(id: string): Promise<void>;
  retry(id: string, attempts: number, code: string): Promise<void>;
  dead(id: string, code: string): Promise<void>;
}

export const REFUND_WORK_PORT = Symbol('REFUND_WORK_PORT');
