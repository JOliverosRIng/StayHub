import { createHash, randomUUID } from 'node:crypto';
import { Money } from '../../src/domain/shared/money';
import { Refund } from '../../src/domain/refunds/refund.entity';
import type { Payment } from '../../src/domain/payments/payment.entity';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import { createPaymentFixture } from '../fixtures/payments.fixture';

describe('refund persistence with PostgreSQL 16', () => {
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

  function approvedPayment(): Payment {
    const payment = createPaymentFixture(10_000_000, 'COP', {
      id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID(),
    });
    payment.approve({ source: 'gateway', reference: 'approved-charge-ref' });
    return payment;
  }

  function pendingRefund(paymentId: string): Refund {
    return Refund.create({
      id: randomUUID(),
      paymentId,
      paymentStatus: 'APPROVED',
      paymentAmount: Money.fromMinor(10_000_000, 'COP'),
      refundedAmount: Money.fromMinor(0, 'COP'),
      reason: 'GUEST_CANCELLATION',
      requestedAmount: Money.fromMinor(4_000_000, 'COP'),
    });
  }

  it('persists refund transitions and hashed evidence with the payment lock in the transaction', async () => {
    const payment = approvedPayment();
    const refund = pendingRefund(payment.id);
    await unitOfWork.transaction(async ({ payments, refunds }) => {
      await payments.save(payment);
      await expect(refunds.lockPaymentForRefund(payment.id)).resolves.toMatchObject({ payment: { id: payment.id } });
      await refunds.save(refund);
      refund.complete({ source: 'gateway', reference: 'opaque-refund-evidence' });
      await refunds.save(refund, {
        gatewayReference: 'opaque-provider-reference',
        evidenceReference: 'opaque-refund-evidence',
        actor: 'bookings-service',
      });
    });

    expect(await prisma.refund.findUnique({ where: { id: refund.id } })).toMatchObject({
      status: 'COMPLETED',
      gatewayReference: 'opaque-provider-reference',
    });
    const history = await prisma.refundStatusHistory.findMany({ where: { refundId: refund.id }, orderBy: { occurredAt: 'asc' } });
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'PENDING', reasonCode: 'REFUND_CREATED' });
    expect(history[1]).toMatchObject({ fromStatus: 'PENDING', toStatus: 'COMPLETED', actor: 'bookings-service' });
    expect(history[1]?.evidenceRefHash).toBe(createHash('sha256').update('opaque-refund-evidence').digest('hex'));
    expect(history[1]?.evidenceRefHash).not.toContain('opaque-refund-evidence');
  });

  it('rolls back refund and immutable history together on transaction failure', async () => {
    const payment = approvedPayment();
    const refund = pendingRefund(payment.id);
    await unitOfWork.transaction(({ payments }) => payments.save(payment));

    await expect(unitOfWork.transaction(async ({ refunds }) => {
      await refunds.lockPaymentForRefund(payment.id);
      await refunds.save(refund);
      throw new Error('simulate refund transaction failure');
    })).rejects.toThrow('simulate refund transaction failure');

    expect(await prisma.refund.findUnique({ where: { id: refund.id } })).toBeNull();
    expect(await prisma.refundStatusHistory.count({ where: { refundId: refund.id } })).toBe(0);
  });
});
