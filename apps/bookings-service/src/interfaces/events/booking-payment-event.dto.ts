import { createHash } from 'node:crypto';
import { DomainError } from '@bookings/domain/shared/domain-error';
import type { PaymentResultEvent, RefundResultEvent } from '@bookings/application/ports/payment-saga.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REFUND = 'payment.v1.refund-completed';
const TYPES = new Set(['payment.v1.confirmed', 'payment.v1.failed', REFUND]);
export type ParsedPaymentEvent = { event: PaymentResultEvent | RefundResultEvent; hash: string };
export function parsePaymentEvent(value: unknown): ParsedPaymentEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('INVALID_EVENT');
  const row = value as Record<string, unknown>;
  const allowed = new Set(['eventId','eventType','schemaVersion','occurredAt','bookingId','paymentOrderId','reasonCode','refundId']);
  if (Object.keys(row).some((key) => !allowed.has(key)) || !UUID.test(String(row.eventId)) || !TYPES.has(String(row.eventType)) || row.schemaVersion !== 1 || !UUID.test(String(row.bookingId)) || !UUID.test(String(row.paymentOrderId)) || Number.isNaN(Date.parse(String(row.occurredAt)))) throw new DomainError('INVALID_EVENT');
  const isRefund = row.eventType === REFUND;
  if (isRefund && !UUID.test(String(row.refundId))) throw new DomainError('INVALID_EVENT');
  if (!isRefund && 'refundId' in row) throw new DomainError('INVALID_EVENT');
  const event = row as unknown as PaymentResultEvent | RefundResultEvent;
  return { event, hash: createHash('sha256').update(JSON.stringify(row)).digest('hex') };
}
