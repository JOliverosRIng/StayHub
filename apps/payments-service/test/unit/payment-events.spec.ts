import {
  approvedPaymentEvent,
  declinedPaymentEvent,
  failedPaymentEvent,
  refundedPaymentEvent,
  refundFailedPaymentEvent,
} from '../../src/application/events/payment-events';
import { readFileSync } from 'node:fs';
import Ajv2020, { type AnySchema } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { randomUUID } from 'node:crypto';
import { Money } from '../../src/domain/shared/money';
import { Refund } from '../../src/domain/refunds/refund.entity';
import { createPaymentFixture } from '../fixtures/payments.fixture';

describe('payment outbox event constructors', () => {
  const payment = createPaymentFixture();
  const occurredAt = new Date('2026-11-07T12:00:00.000Z');

  it('creates a versioned approval event with only contract-approved fields', () => {
    payment.approve({ source: 'gateway', reference: 'opaque-ref' });
    const event = approvedPaymentEvent(payment, occurredAt, 'e3c4edbc-6de6-497b-8fc2-67b38e9581cc');
    expect(event).toMatchObject({
      aggregateId: payment.id,
      eventType: 'payment.v1.approved',
      payload: {
        eventId: event.id,
        eventType: 'payment.v1.approved',
        schemaVersion: 1,
        occurredAt: occurredAt.toISOString(),
        paymentId: payment.id,
        bookingId: payment.bookingId,
        payerUserId: payment.payerUserId,
        amountMinor: payment.amount.amountMinor,
        currency: 'COP',
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/token|gatewayReference|idempotency/i);
  });

  it('includes stable decline and pre-dispatch failure codes', () => {
    const declined = createPaymentFixture();
    declined.decline('INSUFFICIENT_FUNDS', { source: 'gateway', reference: 'opaque-decline' });
    expect(declinedPaymentEvent(declined, occurredAt, 'INSUFFICIENT_FUNDS').payload)
      .toMatchObject({ eventType: 'payment.v1.declined', failureCode: 'INSUFFICIENT_FUNDS' });
    const failed = createPaymentFixture();
    failed.markFailed({ dispatch: 'NOT_DISPATCHED', source: 'gateway-adapter', reference: 'pre-dispatch' });
    expect(failedPaymentEvent(failed, occurredAt).payload)
      .toMatchObject({ eventType: 'payment.v1.failed', failureCode: 'GATEWAY_UNAVAILABLE' });
  });

  it('validates every implemented event against JSON Schema 2020-12 and excludes secrets', () => {
    const schema = JSON.parse(readFileSync(
      '../../specs/003-reservas-pagos-resenas/payments_service/contracts/payment-events-v1.schema.json',
      'utf8',
    )) as AnySchema;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const approved = createPaymentFixture();
    approved.approve({ source: 'gateway', reference: 'sensitive-gateway-reference' });
    const declined = createPaymentFixture();
    declined.decline('CARD_DECLINED', { source: 'gateway', reference: 'sensitive-decline-reference' });
    const failed = createPaymentFixture();
    failed.markFailed({ dispatch: 'NOT_DISPATCHED', source: 'gateway', reference: 'pre-dispatch-proof' });

    const refundedPayment = createPaymentFixture();
    refundedPayment.approve({ source: 'gateway', reference: 'approved-charge' });
    const refund = Refund.create({
      id: randomUUID(),
      paymentId: refundedPayment.id,
      paymentStatus: refundedPayment.status,
      paymentAmount: refundedPayment.amount,
      refundedAmount: refundedPayment.refundedAmount,
      reason: 'GUEST_CANCELLATION',
      requestedAmount: Money.fromMinor(12_000_000, 'COP'),
    });
    refund.complete({ source: 'gateway', reference: 'sensitive-refund-reference' });
    refundedPayment.applyRefund(refund.amount, { source: 'gateway', reference: 'sensitive-refund-reference' });

    const refundFailedPayment = createPaymentFixture();
    refundFailedPayment.approve({ source: 'gateway', reference: 'approved-charge' });
    const failedRefund = Refund.create({
      id: randomUUID(),
      paymentId: refundFailedPayment.id,
      paymentStatus: refundFailedPayment.status,
      paymentAmount: refundFailedPayment.amount,
      refundedAmount: refundFailedPayment.refundedAmount,
      reason: 'OWNER_CANCELLATION',
    });
    failedRefund.fail('CARD_DECLINED', { source: 'gateway', reference: 'sensitive-refund-rejection' });

    const events = [
      approvedPaymentEvent(approved, occurredAt),
      declinedPaymentEvent(declined, occurredAt, 'CARD_DECLINED'),
      failedPaymentEvent(failed, occurredAt),
      refundedPaymentEvent(refundedPayment, refund, occurredAt),
      refundFailedPaymentEvent(refundFailedPayment, failedRefund, occurredAt),
    ];
    for (const item of events) {
      const valid = validate(item.payload);
      expect({ eventType: item.eventType, valid, errors: validate.errors }).toMatchObject({ valid: true });
    }
    const serialized = JSON.stringify(events);
    expect(serialized).not.toMatch(/sensitive-|pre-dispatch-proof|"(?:email|token|cardNumber|gatewayReference|paymentMethodFingerprint|idempotencyKey)"/i);
  });
});
