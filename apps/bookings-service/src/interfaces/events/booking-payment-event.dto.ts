import { createHash } from 'node:crypto';
import { DomainError } from '@bookings/domain/shared/domain-error';
import type { PaymentResultEvent } from '@bookings/application/ports/payment-saga.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TYPES = new Set(['payment.v1.confirmed', 'payment.v1.failed']);
export function parsePaymentEvent(value: unknown): { event: PaymentResultEvent; hash: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('INVALID_EVENT');
  const row = value as Record<string, unknown>;
  const allowed = new Set(['eventId','eventType','schemaVersion','occurredAt','bookingId','paymentOrderId','reasonCode']);
  if (Object.keys(row).some((key) => !allowed.has(key)) || !UUID.test(String(row.eventId)) || !TYPES.has(String(row.eventType)) || row.schemaVersion !== 1 || !UUID.test(String(row.bookingId)) || !UUID.test(String(row.paymentOrderId)) || Number.isNaN(Date.parse(String(row.occurredAt)))) throw new DomainError('INVALID_EVENT');
  const event = row as unknown as PaymentResultEvent;
  return { event, hash: createHash('sha256').update(JSON.stringify(row)).digest('hex') };
}
