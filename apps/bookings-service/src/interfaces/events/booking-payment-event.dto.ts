import { createHash } from 'node:crypto';
import { DomainError } from '@bookings/domain/shared/domain-error';
import type { PaymentEvent, PaymentResultEvent, RefundResultEvent } from '@bookings/application/ports/payment-saga.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const MAX_AMOUNT_MINOR = 9_000_000_000_000;

const PAYMENT_EVENTS = new Set([
  'payment.v1.approved',
  'payment.v1.declined',
  'payment.v1.failed',
  'payment.v1.review_required',
]);
const REFUND_EVENTS = new Set([
  'payment.v1.refunded',
  'payment.v1.refund_failed',
  'payment.v1.refund_review_required',
]);
const PAYMENT_FAILURES = new Set(['INSUFFICIENT_FUNDS', 'CARD_DECLINED', 'SUSPECTED_FRAUD']);
const REFUND_FAILURES = new Set(['CARD_DECLINED', 'GATEWAY_UNAVAILABLE']);
const REFUND_REASONS = new Set(['GUEST_CANCELLATION', 'OWNER_CANCELLATION']);

const BASE_FIELDS = ['eventId', 'eventType', 'schemaVersion', 'occurredAt', 'paymentId', 'bookingId', 'payerUserId', 'amountMinor', 'currency'] as const;

export type ParsedPaymentEvent = { event: PaymentResultEvent | RefundResultEvent; hash: string };

function invalid(): never {
  throw new DomainError('INVALID_EVENT');
}

function assertBase(row: Record<string, unknown>): void {
  if (!UUID.test(String(row.eventId))
    || row.schemaVersion !== 1
    || !DATE_TIME.test(String(row.occurredAt))
    || Number.isNaN(Date.parse(String(row.occurredAt)))
    || !UUID.test(String(row.paymentId))
    || !UUID.test(String(row.bookingId))
    || !UUID.test(String(row.payerUserId))
    || !Number.isSafeInteger(row.amountMinor)
    || (row.amountMinor as number) < 1
    || (row.amountMinor as number) > MAX_AMOUNT_MINOR
    || !CURRENCY.test(String(row.currency))) invalid();
}

function assertExactFields(row: Record<string, unknown>, extra: readonly string[]): void {
  const allowed = new Set<string>([...BASE_FIELDS, ...extra]);
  if (Object.keys(row).some((key) => !allowed.has(key))) invalid();
  if ([...BASE_FIELDS, ...extra].some((key) => !(key in row))) invalid();
}

function assertAmount(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_AMOUNT_MINOR) invalid();
}

export function parsePaymentEvent(value: unknown): ParsedPaymentEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  const eventType = String(row.eventType);
  const isRefund = REFUND_EVENTS.has(eventType);
  if (!PAYMENT_EVENTS.has(eventType) && !isRefund) invalid();
  assertBase(row);

  if (eventType === 'payment.v1.approved') {
    assertExactFields(row, []);
  } else if (eventType === 'payment.v1.declined') {
    assertExactFields(row, ['failureCode']);
    if (!PAYMENT_FAILURES.has(String(row.failureCode))) invalid();
  } else if (eventType === 'payment.v1.failed') {
    assertExactFields(row, ['failureCode']);
    if (row.failureCode !== 'GATEWAY_UNAVAILABLE') invalid();
  } else if (eventType === 'payment.v1.review_required') {
    assertExactFields(row, ['reasonCode']);
    if (row.reasonCode !== 'RECONCILIATION_EXHAUSTED') invalid();
  } else if (eventType === 'payment.v1.refunded') {
    assertExactFields(row, ['refundId', 'refundedAmountMinor', 'totalRefundedAmountMinor', 'reason', 'paymentStatus']);
    if (!UUID.test(String(row.refundId))) invalid();
    assertAmount(row.refundedAmountMinor);
    assertAmount(row.totalRefundedAmountMinor);
    if ((row.totalRefundedAmountMinor as number) < (row.refundedAmountMinor as number)) invalid();
    if (!REFUND_REASONS.has(String(row.reason))) invalid();
    if (row.paymentStatus !== 'PARTIALLY_REFUNDED' && row.paymentStatus !== 'REFUNDED') invalid();
  } else if (eventType === 'payment.v1.refund_failed') {
    assertExactFields(row, ['refundId', 'reason', 'failureCode']);
    if (!UUID.test(String(row.refundId)) || !REFUND_REASONS.has(String(row.reason)) || !REFUND_FAILURES.has(String(row.failureCode))) invalid();
  } else {
    assertExactFields(row, ['refundId', 'reasonCode', 'refundAmountMinor']);
    if (!UUID.test(String(row.refundId)) || row.reasonCode !== 'RECONCILIATION_EXHAUSTED') invalid();
    assertAmount(row.refundAmountMinor);
  }

  const event = row as unknown as PaymentEvent;
  return { event, hash: createHash('sha256').update(canonicalJson(row)).digest('hex') };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
