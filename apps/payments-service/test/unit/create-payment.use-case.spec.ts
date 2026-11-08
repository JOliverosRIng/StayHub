import { DomainError } from '../../src/domain/shared/domain-error';
import { Payment } from '../../src/domain/payments/payment.entity';
import type { PaymentRepository } from '../../src/application/ports/payment.repository';
import type { IdempotencyRecord, IdempotencyRepository } from '../../src/application/ports/idempotency.repository';
import type { PaymentGatewayPort } from '../../src/application/ports/payment-gateway.port';
import type { ClockPort } from '../../src/application/ports/clock.port';
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
  readonly records: Map<string, IdempotencyRecord>;
  readonly savedPayments: Payment[];
}

function createHarness(): Harness {
  const records = new Map<string, IdempotencyRecord>();
  const savedPayments: Payment[] = [];
  const payments: jest.Mocked<PaymentRepository> = {
    findById: jest.fn(async (_id: string): Promise<Payment | null> => null),
    findActiveByBookingId: jest.fn(async (_bookingId: string): Promise<Payment | null> => null),
    save: jest.fn(async (payment) => { savedPayments.push(payment); }),
  };
  const idempotency: jest.Mocked<IdempotencyRepository> = {
    find: jest.fn(async (scope, key, caller) => records.get(`${scope}:${key}:${caller}`) ?? null),
    save: jest.fn(async (record) => { records.set(`${record.scope}:${record.key}:${record.callerSubject}`, record); }),
    delete: jest.fn(async (scope, key, caller) => { records.delete(`${scope}:${key}:${caller}`); }),
  };
  const gateway: jest.Mocked<PaymentGatewayPort> = {
    charge: jest.fn(async (_command: Parameters<PaymentGatewayPort['charge']>[0]) => ({
      kind: 'approved' as const,
      reference: 'gateway-reference',
    })),
    refund: jest.fn(),
    getTransaction: jest.fn(),
  };
  const clock: ClockPort = { now: () => now };
  return {
    useCase: new CreatePayment({
      payments,
      idempotency,
      gateway,
      clock,
      config: {
        allowedCurrencies: ['COP', 'USD'],
        maxAmountMinor: 9_000_000_000_000,
        idempotencyTtlHours: 48,
        tokenHmacSecret: 'payments-test-secret-with-at-least-thirty-two-chars',
      },
    }),
    payments,
    idempotency,
    gateway,
    records,
    savedPayments,
  };
}

describe('CreatePayment', () => {
  it('creates an approved payment when the gateway confirms the charge', async () => {
    const harness = createHarness();
    const result = await harness.useCase.execute({ ...request, idempotencyKey, callerSubject: 'booking-service' });

    expect(result).toMatchObject({ statusCode: 201, payment: { status: 'APPROVED' }, replayed: false });
    expect(harness.gateway.charge).toHaveBeenCalledTimes(1);
    expect(harness.savedPayments).toHaveLength(1);
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
    expect(harness.gateway.charge).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an idempotency key with a different request fingerprint', async () => {
    const harness = createHarness();
    const input = { ...request, idempotencyKey, callerSubject: 'booking-service' };
    await harness.useCase.execute(input);

    await expect(harness.useCase.execute({ ...input, amountMinor: input.amountMinor + 1 }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(harness.gateway.charge).toHaveBeenCalledTimes(1);
  });

  it('blocks a new charge while the booking has an active payment', async () => {
    const harness = createHarness();
    const activePayment = createPaymentFixture(request.amountMinor);
    activePayment.approve({ source: 'gateway', reference: 'approved-charge' });
    jest.spyOn(harness.payments, 'findActiveByBookingId').mockResolvedValue(activePayment);

    await expect(harness.useCase.execute({ ...request, idempotencyKey, callerSubject: 'booking-service' }))
      .rejects.toMatchObject<Partial<DomainError>>({ code: 'STATE_CONFLICT' });
    expect(harness.gateway.charge).not.toHaveBeenCalled();
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
