import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaUnitOfWork, type PaymentUnitOfWorkRepositories, type RefundUnitOfWorkRepositories } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work';
import type { OutboxRepository } from '../../src/application/ports/outbox.repository';
import type { PaymentGatewayPort } from '../../src/application/ports/payment-gateway.port';
import { CreatePayment, type CreatePaymentInput } from '../../src/application/payments/create-payment.use-case';
import { RefundPayment } from '../../src/application/refunds/refund-payment.use-case';
import { MOCK_GATEWAY_TOKENS } from '../fixtures/mock-gateway.fixture';

const config = {
  allowedCurrencies: ['COP', 'USD'] as const,
  maxAmountMinor: 9_000_000_000_000,
  idempotencyTtlHours: 48,
  tokenHmacSecret: 'payments-test-secret-with-at-least-thirty-two-chars',
  reconcilerIntervalMs: 30_000,
};

function failAfterOutboxInsert<TRepositories extends { readonly outbox: OutboxRepository }>(
  unitOfWork: UnitOfWork<TRepositories>,
): UnitOfWork<TRepositories> {
  return {
    transaction: <T>(work: (repositories: TRepositories) => Promise<T>): Promise<T> =>
      unitOfWork.transaction((repositories) => {
        const wrapped = {
          ...repositories,
          outbox: {
            append: async (event: Parameters<OutboxRepository['append']>[0]): Promise<void> => {
              await repositories.outbox.append(event);
              throw new Error('simulate failure after outbox insert');
            },
          },
        } as TRepositories;
        return work(wrapped);
      }),
  };
}

describe('payment and refund outbox atomicity with PostgreSQL 16', () => {
  let prisma: PrismaClient;
  let unitOfWork: PrismaUnitOfWork;

  beforeAll(async () => {
    const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('PAYMENTS_TEST_DATABASE_URL is required');
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    unitOfWork = new PrismaUnitOfWork(prisma as unknown as PrismaService);
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  function gateway(): jest.Mocked<PaymentGatewayPort> {
    return {
      charge: jest.fn((_command) => { void _command; return Promise.resolve({ kind: 'approved' as const, reference: 'a'.repeat(64) }); }),
      refund: jest.fn((_command) => { void _command; return Promise.resolve({ kind: 'completed' as const, reference: 'b'.repeat(64) }); }),
      getTransaction: jest.fn(),
    };
  }

  function createInput(): CreatePaymentInput {
    return {
      bookingId: randomUUID(),
      payerUserId: randomUUID(),
      amountMinor: 125_000,
      currency: 'COP' as const,
      paymentMethod: { type: 'CARD_TOKEN' as const, token: MOCK_GATEWAY_TOKENS.approved },
      idempotencyKey: randomUUID(),
      callerSubject: 'bookings-service',
    };
  }

  it('rolls the charge status transition and inserted event back together', async () => {
    const paymentGateway = gateway();
    const useCase = new CreatePayment({
      unitOfWork: failAfterOutboxInsert(unitOfWork as unknown as UnitOfWork<PaymentUnitOfWorkRepositories>),
      gateway: paymentGateway,
      clock: { now: (): Date => new Date('2026-11-08T12:00:00.000Z') },
      config,
    });

    await expect(useCase.execute(createInput())).rejects.toThrow('simulate failure after outbox insert');
    const paymentId = paymentGateway.charge.mock.calls[0]?.[0].paymentId;
    if (!paymentId) throw new Error('Charge was not dispatched');
    expect(await prisma.payment.findUnique({ where: { id: paymentId } })).toMatchObject({ status: 'PENDING' });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: paymentId, eventType: 'payment.v1.approved' } })).toBe(0);
  });

  it('rolls a completed refund and its event back together', async () => {
    const baseGateway = gateway();
    const created = await new CreatePayment({
      unitOfWork: unitOfWork as unknown as UnitOfWork<PaymentUnitOfWorkRepositories>,
      gateway: baseGateway,
      clock: { now: (): Date => new Date('2026-11-08T12:00:00.000Z') },
      config,
    }).execute(createInput());
    const failingGateway = gateway();
    const refundUseCase = new RefundPayment({
      unitOfWork: failAfterOutboxInsert(unitOfWork as unknown as UnitOfWork<RefundUnitOfWorkRepositories>),
      gateway: failingGateway,
      clock: { now: (): Date => new Date('2026-11-08T12:01:00.000Z') },
      config: { idempotencyTtlHours: config.idempotencyTtlHours, maxAmountMinor: config.maxAmountMinor },
    });

    await expect(refundUseCase.execute({
      paymentId: created.payment.id,
      reason: 'GUEST_CANCELLATION',
      idempotencyKey: randomUUID(),
      callerSubject: 'bookings-service',
    })).rejects.toThrow('simulate failure after outbox insert');
    const refundId = failingGateway.refund.mock.calls[0]?.[0].refundId;
    if (!refundId) throw new Error('Refund was not dispatched');
    expect(await prisma.payment.findUnique({ where: { id: created.payment.id } })).toMatchObject({ status: 'APPROVED', refundedAmountMinor: 0n });
    expect(await prisma.refund.findUnique({ where: { id: refundId } })).toMatchObject({ status: 'PENDING' });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: created.payment.id, eventType: 'payment.v1.refunded' } })).toBe(0);
  });

  it('commits confirmed charge and refund events with their final state changes', async () => {
    const paymentGateway = gateway();
    const created = await new CreatePayment({
      unitOfWork: unitOfWork as unknown as UnitOfWork<PaymentUnitOfWorkRepositories>,
      gateway: paymentGateway,
      clock: { now: (): Date => new Date('2026-11-08T12:00:00.000Z') },
      config,
    }).execute(createInput());
    const paymentId = created.payment.id;
    expect(await prisma.outboxEvent.count({ where: { aggregateId: paymentId, eventType: 'payment.v1.approved' } })).toBe(1);

    const refundGateway = gateway();
    const refund = await new RefundPayment({
      unitOfWork: unitOfWork as unknown as UnitOfWork<RefundUnitOfWorkRepositories>,
      gateway: refundGateway,
      clock: { now: (): Date => new Date('2026-11-08T12:01:00.000Z') },
      config: { idempotencyTtlHours: config.idempotencyTtlHours, maxAmountMinor: config.maxAmountMinor },
    }).execute({ paymentId, reason: 'GUEST_CANCELLATION', idempotencyKey: randomUUID(), callerSubject: 'bookings-service' });

    expect(refund.refund.status).toBe('COMPLETED');
    expect(await prisma.outboxEvent.count({ where: { aggregateId: paymentId, eventType: 'payment.v1.refunded' } })).toBe(1);
    expect(await prisma.payment.findUnique({ where: { id: paymentId } })).toMatchObject({ status: 'REFUNDED', refundedAmountMinor: 125_000n });
  });
});
