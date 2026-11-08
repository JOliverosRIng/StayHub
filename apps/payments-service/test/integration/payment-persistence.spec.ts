import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import { approvedPaymentEvent } from '../../src/application/events/payment-events';
import { createPaymentFixture } from '../fixtures/payments.fixture';

describe('payment persistence unit of work with PostgreSQL 16', () => {
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

  it('commits payment state, immutable history and outbox event together', async () => {
    const payment = createPaymentFixture(35_000_000, 'COP', {
      id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID(),
    });
    await unitOfWork.transaction(async ({ payments, outbox }) => {
      await payments.save(payment);
      payment.approve({ source: 'gateway', reference: 'opaque-ref' });
      await payments.save(payment, { gatewayReference: 'opaque-ref', evidenceReference: 'opaque-ref' });
      await outbox.append(approvedPaymentEvent(payment, new Date('2026-11-07T12:00:00.000Z')));
    });

    await expect(prisma.payment.findUnique({ where: { id: payment.id } })).resolves.toMatchObject({ status: 'APPROVED' });
    await expect(prisma.paymentStatusHistory.count({ where: { paymentId: payment.id } })).resolves.toBe(2);
    await expect(prisma.paymentStatusHistory.findFirst({
      where: { paymentId: payment.id, toStatus: 'APPROVED' },
    })).resolves.toMatchObject({
      evidenceRefHash: createHash('sha256').update('opaque-ref').digest('hex'),
    });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: payment.id } })).resolves.toBe(1);
  });

  it('rolls payment, history and outbox writes back when the transaction fails', async () => {
    const payment = createPaymentFixture(35_000_000, 'COP', {
      id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID(),
    });
    await expect(unitOfWork.transaction(async ({ payments, outbox }) => {
      await payments.save(payment);
      payment.approve({ source: 'gateway', reference: 'opaque-ref' });
      await payments.save(payment);
      await outbox.append(approvedPaymentEvent(payment, new Date()));
      throw new Error('simulate transaction failure');
    })).rejects.toThrow('simulate transaction failure');

    await expect(prisma.payment.findUnique({ where: { id: payment.id } })).resolves.toBeNull();
    await expect(prisma.paymentStatusHistory.count({ where: { paymentId: payment.id } })).resolves.toBe(0);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: payment.id } })).resolves.toBe(0);
  });

  it('maps the active-booking partial unique index to STATE_CONFLICT', async () => {
    const bookingId = randomUUID();
    const first = createPaymentFixture(35_000_000, 'COP', {
      id: randomUUID(), bookingId, payerUserId: randomUUID(),
    });
    const second = createPaymentFixture(35_000_000, 'COP', {
      id: randomUUID(), bookingId, payerUserId: randomUUID(),
    });
    await unitOfWork.transaction(({ payments }) => payments.save(first));

    await expect(unitOfWork.transaction(({ payments }) => payments.save(second)))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    await expect(prisma.payment.count({ where: { bookingId } })).resolves.toBe(1);
  });
});
