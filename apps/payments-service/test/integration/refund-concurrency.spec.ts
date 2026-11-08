import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import { RefundPayment } from '../../src/application/refunds/refund-payment.use-case';
import type { PaymentGatewayPort } from '../../src/application/ports/payment-gateway.port';
import type { ClockPort } from '../../src/application/ports/clock.port';
import type { RefundUnitOfWorkRepositories } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work';
import { createPaymentFixture } from '../fixtures/payments.fixture';

describe('refund concurrency and database safeguards with PostgreSQL 16', () => {
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

  it('serializes concurrent refund requests so only one of two excessive refunds is applied', async () => {
    const payment = createPaymentFixture(10_000_000, 'COP', {
      id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID(),
    });
    payment.approve({ source: 'gateway', reference: 'approved-charge' });
    await unitOfWork.transaction(({ payments }) => payments.save(payment));
    const gateway: jest.Mocked<PaymentGatewayPort> = {
      charge: jest.fn(),
      refund: jest.fn((_command) => { void _command; return Promise.resolve({ kind: 'completed' as const, reference: 'refund-provider-reference' }); }),
      getTransaction: jest.fn(),
    };
    const clock: ClockPort = { now: () => new Date('2026-11-08T12:00:00.000Z') };
    const useCase = new RefundPayment({
      unitOfWork: unitOfWork as unknown as UnitOfWork<RefundUnitOfWorkRepositories>,
      gateway,
      clock,
      config: { idempotencyTtlHours: 48, maxAmountMinor: 9_000_000_000_000 },
    });
    const results = await Promise.allSettled([
      useCase.execute({ paymentId: payment.id, reason: 'GUEST_CANCELLATION', amountMinor: 6_000_000, idempotencyKey: randomUUID(), callerSubject: 'bookings-service' }),
      useCase.execute({ paymentId: payment.id, reason: 'GUEST_CANCELLATION', amountMinor: 6_000_000, idempotencyKey: randomUUID(), callerSubject: 'bookings-service' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const persisted = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(Number(persisted.refundedAmountMinor)).toBe(6_000_000);
    expect(gateway.refund.mock.calls).toHaveLength(1);
  });

  it('rejects a direct refunded total above the payment amount with the database CHECK', async () => {
    const payment = createPaymentFixture(2_000_000, 'COP', {
      id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID(),
    });
    await unitOfWork.transaction(({ payments }) => payments.save(payment));

    await expect(prisma.$executeRaw`
      UPDATE payments SET refunded_amount_minor = amount_minor + 1 WHERE id = ${payment.id}::uuid
    `).rejects.toThrow();
  });

  it('enforces the partial unique index for one PENDING refund per payment', async () => {
    const payment = createPaymentFixture(2_000_000, 'COP', {
      id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID(),
    });
    await unitOfWork.transaction(({ payments }) => payments.save(payment));
    await prisma.refund.create({ data: {
      id: randomUUID(), paymentId: payment.id, amountMinor: 1_000_000n, currency: 'COP', reason: 'GUEST_CANCELLATION', status: 'PENDING',
    } });

    await expect(prisma.refund.create({ data: {
      id: randomUUID(), paymentId: payment.id, amountMinor: 1_000_000n, currency: 'COP', reason: 'GUEST_CANCELLATION', status: 'PENDING',
    } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.refund.count({ where: { paymentId: payment.id, status: 'PENDING' } })).toBe(1);
  });
});
