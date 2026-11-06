import type { StoredBooking } from './create-booking.unit-of-work';

export interface ClaimedPaymentWork { id: string; bookingId: string; idempotencyKey: string; amount: string; currency: string; attempts: number; operation: 'CREATE_ORDER' | 'REQUEST_REFUND'; }
export interface PaymentWorkPort { claim(limit: number): Promise<ClaimedPaymentWork[]>; succeeded(id: string, paymentOrderId: string): Promise<void>; retry(id: string, attempts: number, code: string): Promise<void>; }
export interface BookingReaderPort { findById(id: string): Promise<StoredBooking | null>; }
export interface PaymentResultEvent { eventId: string; eventType: 'payment.v1.confirmed'|'payment.v1.failed'; schemaVersion: 1; occurredAt: string; bookingId: string; paymentOrderId: string; reasonCode?: string; }
export interface RefundResultEvent { eventId: string; eventType: 'payment.v1.refund-completed'; schemaVersion: 1; occurredAt: string; bookingId: string; paymentOrderId: string; refundId: string; }
export interface PaymentResultUnitOfWork { apply(event: PaymentResultEvent, hash: string): Promise<'APPLIED'|'DUPLICATE'>; }
export interface RefundResultUnitOfWork { apply(event: RefundResultEvent, hash: string): Promise<'APPLIED'|'DUPLICATE'>; }
export interface PaymentHoldExpiryPort { expire(limit: number): Promise<number>; }
