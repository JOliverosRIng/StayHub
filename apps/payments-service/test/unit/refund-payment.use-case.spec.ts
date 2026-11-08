import { DomainError } from '../../src/domain/shared/domain-error';
import { Money } from '../../src/domain/shared/money';
import type { Payment } from '../../src/domain/payments/payment.entity';
import { Refund } from '../../src/domain/refunds/refund.entity';
import type { RefundRepository } from '../../src/application/ports/refund.repository';
import type { PaymentRepository } from '../../src/application/ports/payment.repository';
import type { IdempotencyRecord, IdempotencyRepository } from '../../src/application/ports/idempotency.repository';
import type { PaymentGatewayPort } from '../../src/application/ports/payment-gateway.port';
import type { OutboxRepository, NewOutboxEvent } from '../../src/application/ports/outbox.repository';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work';
import { RefundPayment } from '../../src/application/refunds/refund-payment.use-case';
import type { PaymentUnitOfWorkRepositories } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import { createPaymentFixture, TEST_EVIDENCE, TEST_PAYMENT_ID } from '../fixtures/payments.fixture';

const now = new Date('2026-11-08T12:00:00.000Z');
const idempotencyKey = '768c31dd-86be-4b28-90ea-e8d29efcab7a';

interface RefundRepositories extends PaymentUnitOfWorkRepositories {
  readonly refunds: RefundRepository;
}

interface Harness {
  readonly useCase: RefundPayment;
  readonly payment: ReturnType<typeof createPaymentFixture>;
  readonly gateway: jest.Mocked<PaymentGatewayPort>;
  readonly refunds: RefundRepository;
  readonly savedRefunds: Refund[];
  readonly savedPayments: ReturnType<typeof createPaymentFixture>[];
  readonly records: Map<string, IdempotencyRecord>;
  readonly outbox: jest.Mocked<OutboxRepository>;
  readonly executionOrder: string[];
}

function paymentForState(status: 'PENDING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'DECLINED' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED'): Payment {
  const payment = createPaymentFixture();
  if (status === 'REVIEW_REQUIRED') payment.markReviewRequired(TEST_EVIDENCE);
  else if (status === 'APPROVED' || status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED') {
    payment.approve(TEST_EVIDENCE);
    if (status === 'PARTIALLY_REFUNDED') payment.applyRefund(Money.fromMinor(10_000_000, 'COP'), TEST_EVIDENCE);
    if (status === 'REFUNDED') payment.applyRefund(Money.fromMinor(35_000_000, 'COP'), TEST_EVIDENCE);
  } else if (status === 'DECLINED') payment.decline('CARD_DECLINED', TEST_EVIDENCE);
  else if (status === 'FAILED') payment.markFailed({
    dispatch: 'NOT_DISPATCHED', source: 'gateway', reference: 'proven-not-dispatched',
  });
  return payment;
}

function createHarness(status: 'PENDING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'DECLINED' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' = 'APPROVED'): Harness {
  const payment = paymentForState(status);
  const paymentsById = new Map([[payment.id, payment]]);
  const refundsById = new Map<string, Refund>();
  const records = new Map<string, IdempotencyRecord>();
  const savedRefunds: Refund[] = [];
  const savedPayments: ReturnType<typeof createPaymentFixture>[] = [];
  const executionOrder: string[] = [];
  const payments: jest.Mocked<PaymentRepository> = {
    findById: jest.fn((id: string) => Promise.resolve(paymentsById.get(id) ?? null)),
    findActiveByBookingId: jest.fn((bookingId: string) => { void bookingId; return Promise.resolve(null as Payment | null); }),
    save: jest.fn((item) => { paymentsById.set(item.id, item); savedPayments.push(item); return Promise.resolve(); }),
  };
  const refunds: jest.Mocked<RefundRepository> = {
    findById: jest.fn((id: string) => Promise.resolve(refundsById.get(id) ?? null)),
    findInFlightByPaymentId: jest.fn((paymentId: string) => Promise.resolve(
      [...refundsById.values()].find((item) => item.paymentId === paymentId && (item.status === 'PENDING' || item.status === 'REVIEW_REQUIRED')) ?? null,
    )),
    lockPaymentForRefund: jest.fn((paymentId: string) => {
      const locked = paymentsById.get(paymentId);
      return Promise.resolve(locked ? { payment: locked, gatewayReference: 'a'.repeat(64) } : null);
    }),
    save: jest.fn((item) => { refundsById.set(item.id, item); savedRefunds.push(item); return Promise.resolve(); }),
  };
  const idempotency: jest.Mocked<IdempotencyRepository> = {
    find: jest.fn((scope, key, caller) => Promise.resolve(records.get(`${scope}:${key}:${caller}`) ?? null)),
    reserve: jest.fn((record) => {
      const key = `${record.scope}:${record.key}:${record.callerSubject}`;
      const existing = records.get(key);
      if (existing) return Promise.resolve({ record: existing, created: false });
      records.set(key, record);
      return Promise.resolve({ record, created: true });
    }),
    complete: jest.fn((scope, key, caller, responseStatus, responseBody, resourceId) => {
      const recordKey = `${scope}:${key}:${caller}`;
      const existing = records.get(recordKey);
      if (!existing) return Promise.reject(new Error('missing reservation'));
      records.set(recordKey, { ...existing, responseStatus, responseBody, resourceId });
      return Promise.resolve();
    }),
    releasePreDispatch: jest.fn((scope: string, key: string, caller: string, _proof: { readonly dispatch: 'NOT_DISPATCHED'; readonly reason: 'GATEWAY_UNAVAILABLE' }): Promise<void> => {
      void _proof;
      records.delete(`${scope}:${key}:${caller}`);
      return Promise.resolve();
    }),
    purgeExpired: jest.fn((purgeAt: Date): Promise<number> => { void purgeAt; return Promise.resolve(0); }),
  };
  const gateway: jest.Mocked<PaymentGatewayPort> = {
    charge: jest.fn(),
    refund: jest.fn((_command: Parameters<PaymentGatewayPort['refund']>[0]) => {
      void _command;
      executionOrder.push('gateway');
      return Promise.resolve({ kind: 'completed' as const, reference: 'refund-reference' });
    }),
    getTransaction: jest.fn(),
  };
  const outbox: jest.Mocked<OutboxRepository> = {
    append: jest.fn((event: NewOutboxEvent) => { void event; return Promise.resolve(); }),
  };
  const repositories: RefundRepositories = { payments, refunds, idempotency, outbox };
  const unitOfWork: UnitOfWork<RefundRepositories> = {
    transaction: async <T>(work: (value: RefundRepositories) => Promise<T>): Promise<T> => {
      executionOrder.push('transaction:start');
      const result = await work(repositories);
      executionOrder.push('transaction:end');
      return result;
    },
  };
  return {
    useCase: new RefundPayment({
      unitOfWork,
      gateway,
      clock: { now: () => now },
      config: { idempotencyTtlHours: 48, maxAmountMinor: 9_000_000_000_000 },
    }),
    payment,
    gateway,
    refunds,
    savedRefunds,
    savedPayments,
    records,
    outbox,
    executionOrder,
  };
}

describe('RefundPayment', () => {
  const input = {
    paymentId: TEST_PAYMENT_ID,
    reason: 'GUEST_CANCELLATION' as const,
    idempotencyKey,
    callerSubject: 'booking-service',
  };

  it('completes a full refund and updates the payment atomically', async () => {
    const harness = createHarness();
    const result = await harness.useCase.execute(input);

    expect(result).toMatchObject({ statusCode: 201, refund: { paymentId: TEST_PAYMENT_ID, amountMinor: 35_000_000, status: 'COMPLETED' } });
    expect(harness.payment.status).toBe('REFUNDED');
    expect(harness.payment.refundedAmount.amountMinor).toBe(35_000_000);
    expect(harness.gateway.refund.mock.calls).toHaveLength(1);
    expect(harness.executionOrder).toEqual([
      'transaction:start', 'transaction:end', 'gateway', 'transaction:start', 'transaction:end',
    ]);
    expect(harness.outbox.append.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ eventType: 'payment.v1.refunded' }));
  });

  it('supports a partial guest refund and leaves the correct balance', async () => {
    const harness = createHarness();
    const result = await harness.useCase.execute({ ...input, amountMinor: 12_000_000 });

    expect(result).toMatchObject({ statusCode: 201, refund: { amountMinor: 12_000_000, status: 'COMPLETED' } });
    expect(harness.payment.status).toBe('PARTIALLY_REFUNDED');
    expect(harness.payment.refundedAmount.amountMinor).toBe(12_000_000);
  });

  it('rejects a refund above the remaining balance without contacting the gateway', async () => {
    const harness = createHarness();
    await expect(harness.useCase.execute({ ...input, amountMinor: 35_000_001 }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'REFUND_AMOUNT_INVALID' });
    expect(harness.gateway.refund.mock.calls).toHaveLength(0);
  });

  it('rejects a partial OWNER_CANCELLATION refund', async () => {
    const harness = createHarness();
    await expect(harness.useCase.execute({ ...input, reason: 'OWNER_CANCELLATION', amountMinor: 10_000_000 }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'REFUND_AMOUNT_INVALID' });
    expect(harness.gateway.refund.mock.calls).toHaveLength(0);
  });

  it.each(['PENDING', 'REVIEW_REQUIRED', 'DECLINED', 'FAILED', 'REFUNDED'] as const)(
    'rejects a payment in %s state', async (status) => {
      const harness = createHarness(status);
      await expect(harness.useCase.execute(input)).rejects.toMatchObject<Partial<DomainError>>({ code: 'STATE_CONFLICT' });
    },
  );

  it('records a definitive gateway rejection without changing the payment balance', async () => {
    const harness = createHarness();
    harness.gateway.refund.mockResolvedValue({ kind: 'failed', reference: 'decline-ref', failureCode: 'CARD_DECLINED' });
    const result = await harness.useCase.execute(input);

    expect(result).toMatchObject({ statusCode: 201, refund: { status: 'FAILED', failureCode: 'CARD_DECLINED' } });
    expect(harness.payment.status).toBe('APPROVED');
    expect(harness.payment.refundedAmount.amountMinor).toBe(0);
    expect(harness.outbox.append.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ eventType: 'payment.v1.refund_failed' }));
  });

  it('keeps an ambiguous gateway result PENDING, retains its key and blocks another refund', async () => {
    const harness = createHarness();
    harness.gateway.refund.mockResolvedValue({ kind: 'uncertain', reference: 'uncertain-ref' });
    const result = await harness.useCase.execute(input);

    expect(result).toMatchObject({ statusCode: 202, refund: { status: 'PENDING', failureCode: 'GATEWAY_TIMEOUT' } });
    expect(harness.records.size).toBe(1);
    await expect(harness.useCase.execute({ ...input, idempotencyKey: '96fb2227-37f0-477f-8570-2e4919fa3e69' }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'STATE_CONFLICT' });
    expect(harness.gateway.refund.mock.calls).toHaveLength(1);
  });

  it('releases the key only when the gateway proves a refund was not dispatched', async () => {
    const harness = createHarness();
    harness.gateway.refund.mockResolvedValueOnce({ kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE' });

    await expect(harness.useCase.execute(input)).rejects.toMatchObject<Partial<DomainError>>({ code: 'UNAVAILABLE' });
    expect(harness.records.size).toBe(0);
    expect(harness.savedRefunds.at(-1)?.status).toBe('FAILED');

    harness.gateway.refund.mockResolvedValueOnce({ kind: 'completed', reference: 'retry-refund' });
    await expect(harness.useCase.execute(input)).resolves.toMatchObject({ statusCode: 201, refund: { status: 'COMPLETED' } });
  });

  it('replays the original idempotent result and rejects the same key with a changed body', async () => {
    const harness = createHarness();
    const original = await harness.useCase.execute(input);
    const replay = await harness.useCase.execute(input);
    expect(replay).toEqual({ ...original, replayed: true });
    expect(harness.gateway.refund.mock.calls).toHaveLength(1);
    await expect(harness.useCase.execute({ ...input, amountMinor: 1_000_000 }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});
