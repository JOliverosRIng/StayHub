import {
  approvedPaymentEvent,
  declinedPaymentEvent,
  failedPaymentEvent,
} from '../../src/application/events/payment-events';
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
});
