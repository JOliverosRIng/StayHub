import { DomainError } from '../../src/domain/shared/domain-error';
import { Payment } from '../../src/domain/payments/payment.entity';
import type { PaymentRepository } from '../../src/application/ports/payment.repository';
import type { IdempotencyRecord, IdempotencyRepository } from '../../src/application/ports/idempotency.repository';
import type { PaymentGatewayPort } from '../../src/application/ports/payment-gateway.port';
import type { ClockPort } from '../../src/application/ports/clock.port';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work';
import type { PaymentUnitOfWorkRepositories } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import type { OutboxRepository } from '../../src/application/ports/outbox.repository';
import type { NewOutboxEvent } from '../../src/application/ports/outbox.repository';
import { CreatePayment } from '../../src/application/payments/create-payment.use-case';
import { createPaymentFixture, TEST_BOOKING_ID, TEST_PAYER_ID } from '../fixtures/payments.fixture';
import { MOCK_GATEWAY_TOKENS } from '../fixtures/mock-gateway.fixture';

const now = new Date('2026-11-07T12:00:00.000Z');
const idempotencyKey = '768c31dd-86be-4b28-90ea-e8d29efcab7a';
const request = {
  bookingId: TEST_BOOKING_ID,
  payerUserId: TEST_PAYER_ID,
  amountMinor: 35_000_000,
  currency: 'COP' as const,
  paymentMethod: { type: 'CARD_TOKEN' as const, token: MOCK_GATEWAY_TOKENS.approved },
};

interface Harness {
  readonly useCase: CreatePayment;
  readonly payments: PaymentRepository;
  readonly idempotency: IdempotencyRepository;
  readonly gateway: jest.Mocked<PaymentGatewayPort>;
  readonly outbox: jest.Mocked<OutboxRepository>;
  readonly executionOrder: string[];
  readonly records: Map<string, IdempotencyRecord>;
  readonly savedPayments: Payment[];
}

function createHarness(): Harness {
  const records = new Map<string, IdempotencyRecord>();
  const savedPayments: Payment[] = [];
  const executionOrder: string[] = [];
  const payments: jest.Mocked<PaymentRepository> = {
    findById: jest.fn((_id: string): Promise<Payment | null> => { void _id; return Promise.resolve(null); }),
    findActiveByBookingId: jest.fn((_bookingId: string): Promise<Payment | null> => { void _bookingId; return Promise.resolve(null); }),
    save: jest.fn((payment) => { savedPayments.push(payment); return Promise.resolve(); }),
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
    releasePreDispatch: jest.fn(async (scope: string, key: string, caller: string, proof: { dispatch: 'NOT_DISPATCHED'; reason: 'GATEWAY_UNAVAILABLE' }): Promise<void> => {
      void proof;
      records.delete(`${scope}:${key}:${caller}`);
      return Promise.resolve();
    }),
    purgeExpired: jest.fn((nowArg: Date): Promise<number> => { void nowArg; return Promise.resolve(0); }),
  };
  const gateway: jest.Mocked<PaymentGatewayPort> = {
    charge: jest.fn((_command: Parameters<PaymentGatewayPort['charge']>[0]) => {
      void _command;
      executionOrder.push('gateway');
      return Promise.resolve({ kind: 'approved' as const, reference: 'gateway-reference' });
    }),
    refund: jest.fn(),
    getTransaction: jest.fn(),
  };
  const outbox: jest.Mocked<OutboxRepository> = {
    append: jest.fn((event: NewOutboxEvent): Promise<void> => { void event; return Promise.resolve(); }),
  };
  const unitOfWork: UnitOfWork<PaymentUnitOfWorkRepositories> = {
    transaction: async <T>(work: (repositories: PaymentUnitOfWorkRepositories) => Promise<T>): Promise<T> => {
      executionOrder.push('transaction:start');
      const result = await work({ payments, idempotency, outbox });
      executionOrder.push('transaction:end');
      return result;
    },
  };
  const clock: ClockPort = { now: () => now };
  return {
    useCase: new CreatePayment({
      unitOfWork,
      gateway,
      clock,
      config: {
        allowedCurrencies: ['COP', 'USD'],
        maxAmountMinor: 9_000_000_000_000,
        idempotencyTtlHours: 48,
        tokenHmacSecret: 'payments-test-secret-with-at-least-thirty-two-chars',
        reconcilerIntervalMs: 30_000,
      },
    }),
    payments,
    idempotency,
    gateway,
    outbox,
    executionOrder,
    records,
    savedPayments,
  };
}

describe('CreatePayment', () => {
  it('creates an approved payment when the gateway confirms the charge', async () => {
    const harness = createHarness();
    const result = await harness.useCase.execute({ ...request, idempotencyKey, callerSubject: 'booking-service' });

    expect(result).toMatchObject({ statusCode: 201, payment: { status: 'APPROVED' }, replayed: false });
    expect(harness.gateway.charge.mock.calls).toHaveLength(1);
    expect(harness.savedPayments).toHaveLength(2);
    expect(harness.executionOrder).toEqual([
      'transaction:start', 'transaction:end', 'gateway', 'transaction:start', 'transaction:end',
    ]);
    expect(harness.outbox.append.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ eventType: 'payment.v1.approved' }));
    expect(JSON.stringify(harness.records)).not.toContain(MOCK_GATEWAY_TOKENS.approved);
  });

  it('returns a confirmed decline as a created business result', async () => {
    const harness = createHarness();
    harness.gateway.charge.mockResolvedValue({
      kind: 'declined', reference: 'decline-reference', failureCode: 'INSUFFICIENT_FUNDS',
    });

    const result = await harness.useCase.execute({ ...request, idempotencyKey, callerSubject: 'booking-service' });

    expect(result).toMatchObject({
      statusCode: 201,
      payment: { status: 'DECLINED', failureCode: 'INSUFFICIENT_FUNDS' },
    });
  });

  it('keeps a possibly dispatched charge pending and responds asynchronously', async () => {
    const harness = createHarness();
    harness.gateway.charge.mockResolvedValue({ kind: 'uncertain' });

    const result = await harness.useCase.execute({ ...request, idempotencyKey, callerSubject: 'booking-service' });

    expect(result).toMatchObject({ statusCode: 202, payment: { status: 'PENDING' }, replayed: false });
    expect(harness.records.size).toBe(1);
  });

  it('replays the original response for the same key and request without charging twice', async () => {
    const harness = createHarness();
    const input = { ...request, idempotencyKey, callerSubject: 'booking-service' };
    const original = await harness.useCase.execute(input);
    const replay = await harness.useCase.execute(input);

    expect(replay).toEqual({ ...original, replayed: true });
    expect(harness.gateway.charge.mock.calls).toHaveLength(1);
  });

  it('rejects reuse of an idempotency key with a different request fingerprint', async () => {
    const harness = createHarness();
    const input = { ...request, idempotencyKey, callerSubject: 'booking-service' };
    await harness.useCase.execute(input);

    await expect(harness.useCase.execute({ ...input, amountMinor: input.amountMinor + 1 }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(harness.gateway.charge.mock.calls).toHaveLength(1);
  });

  it('blocks a new charge while the booking has an active payment', async () => {
    const harness = createHarness();
    const activePayment = createPaymentFixture(request.amountMinor);
    activePayment.approve({ source: 'gateway', reference: 'approved-charge' });
    jest.spyOn(harness.payments, 'findActiveByBookingId').mockResolvedValue(activePayment);

    await expect(harness.useCase.execute({ ...request, idempotencyKey, callerSubject: 'booking-service' }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'STATE_CONFLICT' });
    expect(harness.gateway.charge.mock.calls).toHaveLength(0);
  });

  it('returns unavailable only when the gateway proves the request was not dispatched', async () => {
    const harness = createHarness();
    harness.gateway.charge.mockResolvedValue({ kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE' });

    await expect(harness.useCase.execute({ ...request, idempotencyKey, callerSubject: 'booking-service' }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'UNAVAILABLE' });
    expect(harness.savedPayments.at(-1)?.status).toBe('FAILED');
    expect(harness.records.size).toBe(0);
  });
});
