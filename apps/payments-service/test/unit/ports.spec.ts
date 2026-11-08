import type { PaymentGatewayPort } from '../../src/application/ports/payment-gateway.port';
import type { PaymentRepository } from '../../src/application/ports/payment.repository';
import type { RefundRepository } from '../../src/application/ports/refund.repository';
import type { IdempotencyRepository } from '../../src/application/ports/idempotency.repository';
import type { OutboxRepository } from '../../src/application/ports/outbox.repository';
import type { ClockPort } from '../../src/application/ports/clock.port';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work';

describe('application ports', () => {
  it('models gateway uncertainty separately from confirmed pre-dispatch failure', async () => {
    const gateway: PaymentGatewayPort = {
      charge: () => Promise.resolve({ kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE' }),
      refund: () => Promise.resolve({ kind: 'uncertain', reference: 'gateway-op-1' }),
      getTransaction: () => Promise.resolve({ kind: 'unknown' }),
    };

    expect(await gateway.charge({
      paymentId: 'payment-1',
      token: 'opaque-token',
      amountMinor: 100,
      currency: 'COP',
      idempotencyReference: 'idem-1',
    })).toEqual({ kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE' });
    expect(await gateway.getTransaction('gateway-op-1')).toEqual({ kind: 'unknown' });
  });

  it('exposes repository, clock, outbox, and transaction abstractions without infrastructure types', async () => {
    const paymentRepository: PaymentRepository = {
      findById: () => Promise.resolve(null),
      findActiveByBookingId: () => Promise.resolve(null),
      save: () => Promise.resolve(),
    };
    const refundRepository: RefundRepository = {
      findById: () => Promise.resolve(null),
      findInFlightByPaymentId: () => Promise.resolve(null),
      save: () => Promise.resolve(),
    };
    const idempotencyRepository: IdempotencyRepository = {
      find: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    const outboxRepository: OutboxRepository = { append: () => Promise.resolve() };
    const clock: ClockPort = { now: () => new Date(0) };
    const unitOfWork: UnitOfWork<{ paymentRepository: PaymentRepository }> = {
      transaction: (work) => Promise.resolve().then(() => work({ paymentRepository })),
    };

    expect(await unitOfWork.transaction((repositories) => repositories.paymentRepository.findById('p-1'))).toBeNull();
    expect(clock.now().getTime()).toBe(0);
    expect(await refundRepository.findById('r-1')).toBeNull();
    expect(await idempotencyRepository.find('payment', 'key', 'subject')).toBeNull();
    await expect(outboxRepository.append({
      id: 'event-1',
      aggregateId: 'payment-1',
      eventType: 'payment.v1.approved',
      payload: {},
    })).resolves.toBeUndefined();
  });
});
