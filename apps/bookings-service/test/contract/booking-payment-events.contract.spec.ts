import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parsePaymentEvent } from '@bookings/interfaces/events/booking-payment-event.dto';

const uuid = (suffix: number): string => `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const producerSchemaPath = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/payments_service/contracts/payment-events-v1.schema.json');
const bookingSchemaPath = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/booking_service/contracts/booking-payment-events-v1.schema.json');
const producerSchema = JSON.parse(readFileSync(producerSchemaPath, 'utf8')) as object;
const bookingSchema = JSON.parse(readFileSync(bookingSchemaPath, 'utf8')) as { $defs?: Record<string, unknown> };
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validateProducer = ajv.compile(producerSchema);
const validateBooking = ajv.compile(bookingSchema);

const base = {
  eventId: uuid(1),
  schemaVersion: 1,
  occurredAt: '2030-01-01T00:00:00Z',
  paymentId: uuid(2),
  bookingId: uuid(3),
  payerUserId: uuid(4),
  amountMinor: 1000,
  currency: 'USD',
};
const refundBase = { refundId: uuid(5), reason: 'GUEST_CANCELLATION' as const };

const paymentEvents = [
  { ...base, eventType: 'payment.v1.approved' },
  { ...base, eventType: 'payment.v1.declined', failureCode: 'CARD_DECLINED' },
  { ...base, eventType: 'payment.v1.failed', failureCode: 'GATEWAY_UNAVAILABLE' },
  { ...base, eventType: 'payment.v1.review_required', reasonCode: 'RECONCILIATION_EXHAUSTED' },
  { ...base, ...refundBase, eventType: 'payment.v1.refunded', refundedAmountMinor: 500, totalRefundedAmountMinor: 500, paymentStatus: 'REFUNDED' },
  { ...base, ...refundBase, eventType: 'payment.v1.refund_failed', failureCode: 'CARD_DECLINED' },
  { ...base, refundId: uuid(5), eventType: 'payment.v1.refund_review_required', reasonCode: 'RECONCILIATION_EXHAUSTED', refundAmountMinor: 500 },
];

describe('Payments provider events consumed by Bookings', () => {
  it.each(paymentEvents)('validates real $eventType against the producer JSON Schema', (event) => {
    expect(validateProducer(event)).toBe(true);
  });

  it.each(paymentEvents)('parses real $eventType strictly', (event) => {
    expect(parsePaymentEvent(event).event.eventType).toBe(event.eventType);
  });

  it('hashes the same payload deterministically regardless of key order', () => {
    const event = { ...base, eventType: 'payment.v1.approved' } as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(event).reverse());
    expect(parsePaymentEvent(event).hash).toBe(parsePaymentEvent(reordered).hash);
  });

  it.each([
    ['unknown fields', { ...base, eventType: 'payment.v1.approved', secret: 'x' }],
    ['unsupported version', { ...base, eventType: 'payment.v1.approved', schemaVersion: 2 }],
    ['missing decline code', { ...base, eventType: 'payment.v1.declined' }],
    ['wrong refund reason code', { ...base, ...refundBase, eventType: 'payment.v1.refund_review_required', reasonCode: 'OTHER', refundAmountMinor: 500 }],
    ['refund without refundId', { ...base, eventType: 'payment.v1.refunded', refundedAmountMinor: 500, totalRefundedAmountMinor: 500, reason: 'GUEST_CANCELLATION', paymentStatus: 'REFUNDED' }],
    ['approval carrying a refundId', { ...base, eventType: 'payment.v1.approved', refundId: uuid(5) }],
    ['invalid currency', { ...base, eventType: 'payment.v1.approved', currency: 'usd' }],
    ['legacy confirmed event name', { ...base, eventType: 'payment.v1.confirmed' }],
    ['legacy refund completed event name', { ...base, ...refundBase, eventType: 'payment.v1.refund-completed' }],
  ])('rejects %s', (_name, event) => {
    expect(() => parsePaymentEvent(event)).toThrow('INVALID_EVENT');
  });
});

describe('Bookings outbound event schema', () => {
  const bookingBase = { eventId: uuid(1), schemaVersion: 1, occurredAt: '2030-01-01T00:00:00Z', bookingId: uuid(2) };
  it.each([
    { ...bookingBase, eventType: 'booking.v1.created', guestId: uuid(3), ownerId: uuid(4), propertyId: uuid(5), roomId: uuid(6), checkIn: '2030-02-01', checkOut: '2030-02-02', total: { amount: '10.00', currency: 'USD' }, status: 'PENDING_PAYMENT' },
    { ...bookingBase, eventType: 'booking.v1.confirmed', guestId: uuid(3), propertyName: 'Hotel', roomName: 'Suite', checkIn: '2030-02-01', checkOut: '2030-02-02', guests: 2, totalPrice: '10.00', checkInAt: '2030-02-01T00:00:00.000Z' },
    { ...bookingBase, eventType: 'booking.v1.cancelled', cancelledBy: 'GUEST' },
    { ...bookingBase, eventType: 'booking.v1.completed', guestId: uuid(3), propertyId: uuid(5) },
  ])('validates $eventType', (event) => {
    expect(validateBooking(event)).toBe(true);
  });

  it('no longer declares legacy payment consumer events', () => {
    const definitions = Object.keys(bookingSchema.$defs ?? {});
    expect(definitions).not.toEqual(expect.arrayContaining(['paymentConfirmed', 'paymentFailed', 'refundCompleted']));
    expect(JSON.stringify(bookingSchema)).not.toContain('payment.v1.confirmed');
    expect(JSON.stringify(bookingSchema)).not.toContain('payment.v1.refund-completed');
  });
});
