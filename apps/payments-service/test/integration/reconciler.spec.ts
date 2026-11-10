import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaUnitOfWork, type PaymentUnitOfWorkRepositories, type RefundUnitOfWorkRepositories } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import { PrismaReconciliationRepository } from '../../src/infrastructure/persistence/prisma/reconciliation.repository';
import type { PaymentGatewayPort, TransactionResult } from '../../src/application/ports/payment-gateway.port';
import { ReconcilePending } from '../../src/application/payments/reconcile-pending.use-case';
import { CreatePayment } from '../../src/application/payments/create-payment.use-case';
import { RefundPayment } from '../../src/application/refunds/refund-payment.use-case';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work';
import { Payment } from '../../src/domain/payments/payment.entity';
import { Money } from '../../src/domain/shared/money';
import { Refund } from '../../src/domain/refunds/refund.entity';
import { tokenFingerprint } from '../../src/infrastructure/security/token-fingerprint';
import { MOCK_GATEWAY_TOKENS } from '../fixtures/mock-gateway.fixture';
import type { ReconciliationObserverPort } from '../../src/application/ports/reconciliation-observer.port';

const secret = 'payments-reconciler-test-secret-with-32-chars';
const config = {
  allowedCurrencies: ['COP', 'USD'] as const,
  maxAmountMinor: 9_000_000_000_000,
  idempotencyTtlHours: 48,
  tokenHmacSecret: secret,
  reconcilerIntervalMs: 30_000,
  reconcilerBatchSize: 25,
  reconcilerMaxAttempts: 2,
  gatewayTimeoutMs: 1_000,
};

describe('pending payment reconciliation with PostgreSQL 16', () => {
  let prisma: PrismaClient;
  let unitOfWork: PrismaUnitOfWork;
  let repository: PrismaReconciliationRepository;

  beforeAll(async () => {
    const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('PAYMENTS_TEST_DATABASE_URL is required');
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    unitOfWork = new PrismaUnitOfWork(prisma as unknown as PrismaService);
    repository = new PrismaReconciliationRepository(prisma);
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  function gateway(lookup: (reference: string) => Promise<TransactionResult>): jest.Mocked<PaymentGatewayPort> {
    return {
      charge: jest.fn(),
      refund: jest.fn(),
      getTransaction: jest.fn(lookup),
    };
  }

  function payment(options: { readonly status?: 'APPROVED' | 'PENDING'; readonly bookingId?: string } = {}): Payment {
    const entity = Payment.create({
      id: randomUUID(), bookingId: options.bookingId ?? randomUUID(), payerUserId: randomUUID(),
      paymentMethodFingerprint: tokenFingerprint(MOCK_GATEWAY_TOKENS.approved, secret),
      amount: Money.fromMinor(80_000, 'COP'),
    });
    if (options.status === 'APPROVED') entity.approve({ source: 'test-gateway', reference: 'approved-evidence' });
    return entity;
  }

  async function seedUncertainPayment(options: { readonly attempts?: number; readonly bookingId?: string } = {}): Promise<Payment> {
    const entity = payment(options.bookingId ? { bookingId: options.bookingId } : {});
    entity.markUncertain({ source: 'gateway-adapter', reference: 'uncertain-charge' });
    await unitOfWork.transaction(({ payments }) => payments.save(entity, {
      gatewayReference: 'a'.repeat(64),
      nextReconcileAt: new Date(Date.now() - 1_000),
      reconcileAttempts: options.attempts ?? 0,
    }));
    return entity;
  }

  async function seedUncertainRefund(entity: Payment, attempts = 0): Promise<Refund> {
    const refund = Refund.create({
      id: randomUUID(), paymentId: entity.id, paymentStatus: entity.status,
      paymentAmount: entity.amount, refundedAmount: entity.refundedAmount,
      reason: 'GUEST_CANCELLATION', requestedAmount: Money.fromMinor(20_000, 'COP'),
    });
    refund.markUncertain({ source: 'gateway-adapter', reference: 'uncertain-refund' });
    await unitOfWork.transaction(async ({ payments, refunds }) => {
      await payments.save(entity);
      await refunds.save(refund, {
        gatewayReference: 'b'.repeat(64),
        nextReconcileAt: new Date(Date.now() - 1_000),
        reconcileAttempts: attempts,
      });
    });
    return refund;
  }

  function reconciler(
    paymentGateway: PaymentGatewayPort,
    maxAttempts = config.reconcilerMaxAttempts,
    observer?: ReconciliationObserverPort,
  ): ReconcilePending {
    return new ReconcilePending(repository, unitOfWork as unknown as UnitOfWork<RefundUnitOfWorkRepositories>, paymentGateway, {
      batchSize: 25, maxAttempts, intervalMs: 10, leaseMs: 60_000,
    }, undefined, observer);
  }

  it('resolves definitive charge and refund results and commits their outbox events atomically', async () => {
    const charge = await seedUncertainPayment();
    const refundPayment = payment({ status: 'APPROVED' });
    const refund = await seedUncertainRefund(refundPayment);
    const resolved = new Map<string, TransactionResult>([
      ['a'.repeat(64), { kind: 'approved', reference: 'c'.repeat(64) }],
      ['b'.repeat(64), { kind: 'refund-completed', reference: 'd'.repeat(64) }],
    ]);
    const paymentGateway = gateway((reference) => Promise.resolve(resolved.get(reference) ?? { kind: 'unknown' }));

    expect(await reconciler(paymentGateway).execute()).toBeGreaterThanOrEqual(2);
    await expect(prisma.payment.findUnique({ where: { id: charge.id } })).resolves.toMatchObject({ status: 'APPROVED' });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: charge.id, eventType: 'payment.v1.approved' } })).resolves.toBe(1);
    await expect(prisma.refund.findUnique({ where: { id: refund.id } })).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(prisma.payment.findUnique({ where: { id: refundPayment.id } })).resolves.toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedAmountMinor: 20_000n });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: refundPayment.id, eventType: 'payment.v1.refunded' } })).resolves.toBe(1);
  });

  it('exhausts ambiguous results to REVIEW_REQUIRED, emits review events and keeps both operations blocked', async () => {
    const bookingId = randomUUID();
    const charge = await seedUncertainPayment({ attempts: config.reconcilerMaxAttempts - 1, bookingId });
    const refundPayment = payment({ status: 'APPROVED' });
    const refund = await seedUncertainRefund(refundPayment, config.reconcilerMaxAttempts - 1);
    const paymentGateway = gateway(() => Promise.resolve({ kind: 'unknown' }));

    await reconciler(paymentGateway).execute();
    await expect(prisma.payment.findUnique({ where: { id: charge.id } })).resolves.toMatchObject({ status: 'REVIEW_REQUIRED', failureCode: 'RECONCILIATION_EXHAUSTED' });
    await expect(prisma.refund.findUnique({ where: { id: refund.id } })).resolves.toMatchObject({ status: 'REVIEW_REQUIRED', failureCode: 'RECONCILIATION_EXHAUSTED' });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: charge.id, eventType: 'payment.v1.review_required' } })).resolves.toBe(1);
    const refundReviewEvent = await prisma.outboxEvent.findFirst({ where: { aggregateId: refundPayment.id, eventType: 'payment.v1.refund_review_required' } });
    expect(refundReviewEvent?.payload).toEqual(expect.objectContaining({ refundAmountMinor: 20_000 }));

    const createGateway = gateway(() => Promise.resolve({ kind: 'unknown' }));
    const create = new CreatePayment({
      unitOfWork: unitOfWork as unknown as UnitOfWork<PaymentUnitOfWorkRepositories>,
      gateway: createGateway,
      clock: { now: (): Date => new Date() },
      config,
    });
    await expect(create.execute({
      bookingId, payerUserId: randomUUID(), amountMinor: 80_000, currency: 'COP',
      paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
      idempotencyKey: randomUUID(), callerSubject: 'bookings-service',
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(createGateway.charge.mock.calls).toHaveLength(0);

    const refundUseCase = new RefundPayment({
      unitOfWork: unitOfWork as unknown as UnitOfWork<RefundUnitOfWorkRepositories>,
      gateway: createGateway,
      clock: { now: (): Date => new Date() },
      config,
    });
    await expect(refundUseCase.execute({
      paymentId: refundPayment.id, reason: 'GUEST_CANCELLATION',
      idempotencyKey: randomUUID(), callerSubject: 'bookings-service',
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(createGateway.refund.mock.calls).toHaveLength(0);
  });

  it('claims a due payment only once across two repository instances and calls the gateway outside SQL transactions', async () => {
    await prisma.$executeRaw`UPDATE payments SET next_reconcile_at = NULL WHERE status = 'PENDING'`;
    await prisma.$executeRaw`UPDATE refunds SET next_reconcile_at = NULL WHERE status = 'PENDING'`;
    const pending = await seedUncertainPayment();
    const otherRepository = new PrismaReconciliationRepository(prisma);
    const [firstClaims, secondClaims] = await Promise.all([
      repository.claimDueBatch(10, 60_000),
      otherRepository.claimDueBatch(10, 60_000),
    ]);
    const claimsForPayment = [...firstClaims, ...secondClaims].filter((claim) => claim.kind === 'payment' && claim.id === pending.id);
    expect(claimsForPayment).toHaveLength(1);

    await prisma.payment.update({ where: { id: pending.id }, data: { nextReconcileAt: new Date(Date.now() - 1_000), reconcileAttempts: 0 } });
    let idleTransactions = -1;
    const paymentGateway = gateway(() => {
      const pendingResult = prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::integer AS count FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle in transaction'
      `;
      return pendingResult.then((rows) => {
        idleTransactions = rows[0]?.count ?? -1;
        return { kind: 'unknown' as const };
      });
    });
    await reconciler(paymentGateway, 5).execute();
    expect(paymentGateway.getTransaction.mock.calls).toHaveLength(1);
    expect(idleTransactions).toBe(0);
  });

  it('does not reapply a resource resolved by another worker and reports a redacted resolution log record', async () => {
    const pending = await seedUncertainPayment();
    const logRecords: Array<{ readonly kind: string; readonly outcome: string; readonly attempts: number; readonly durationMs: number }> = [];
    const paymentGateway = gateway(async (reference) => {
      if (reference !== 'a'.repeat(64)) return { kind: 'unknown' };
      await unitOfWork.transaction(async ({ payments, outbox }) => {
        const current = await payments.findById(pending.id);
        if (!current) throw new Error('Payment was unexpectedly absent');
        current.approve({ source: 'another-reconciler', reference: 'e'.repeat(64) });
        await payments.save(current, { evidenceReference: 'e'.repeat(64), nextReconcileAt: null });
        await outbox.append({
          id: randomUUID(), aggregateId: pending.id, eventType: 'payment.v1.approved',
          payload: { eventType: 'payment.v1.approved', paymentId: pending.id },
        });
      });
      return { kind: 'approved', reference: 'e'.repeat(64) };
    });
    const observer: ReconciliationObserverPort = { resolved: (record) => { logRecords.push(record); } };

    await reconciler(paymentGateway, config.reconcilerMaxAttempts, observer).execute();
    await expect(prisma.payment.findUnique({ where: { id: pending.id } })).resolves.toMatchObject({ status: 'APPROVED' });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: pending.id, eventType: 'payment.v1.approved' } })).resolves.toBe(1);
    expect(logRecords).toContainEqual(expect.objectContaining({ kind: 'payment', outcome: 'ALREADY_RESOLVED', attempts: 1 }));
    expect(JSON.stringify(logRecords)).not.toMatch(/a{64}|e{64}|paymentId|gatewayReference/i);
  });
});
