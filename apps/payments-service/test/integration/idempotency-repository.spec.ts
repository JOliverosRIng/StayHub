import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaIdempotencyRepository } from '../../src/infrastructure/persistence/prisma/idempotency.repository';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import type { IdempotencyRecord } from '../../src/application/ports/idempotency.repository';
import { createPaymentFixture } from '../fixtures/payments.fixture';

describe('idempotency repository with PostgreSQL 16', () => {
  let prisma: PrismaClient;
  let repository: PrismaIdempotencyRepository;
  let unitOfWork: PrismaUnitOfWork;

  beforeAll(async () => {
    const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('PAYMENTS_TEST_DATABASE_URL is required');
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    repository = new PrismaIdempotencyRepository(prisma as unknown as PrismaService);
    unitOfWork = new PrismaUnitOfWork(prisma as unknown as PrismaService);
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  function reservation(overrides: Partial<{
    scope: string;
    key: string;
    callerSubject: string;
    responseStatus: number | null;
    responseBody: Readonly<Record<string, unknown>> | null;
    resourceId: string | null;
    expiresAt: Date;
  }> = {}): IdempotencyRecord {
    return {
      scope: 'charge',
      key: randomUUID(),
      callerSubject: 'booking-service',
      requestFingerprint: 'a'.repeat(64),
      responseStatus: null,
      responseBody: null,
      resourceId: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  it('atomically reserves a key and returns the existing record on a duplicate reservation', async () => {
    const record = reservation();
    const [first, second] = await Promise.all([repository.reserve(record), repository.reserve(record)]);

    expect(first.record).toEqual(second.record);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect(await prisma.idempotencyRecord.count({
      where: { scope: record.scope, key: record.key, callerSubject: record.callerSubject },
    })).toBe(1);
  });

  it('stores and returns the exact original response for replay', async () => {
    const record = reservation();
    await repository.reserve(record);
    const response = { id: randomUUID(), status: 'PENDING', amountMinor: 125_000 };
    await repository.complete(record.scope, record.key, record.callerSubject, 202, response, response.id);

    await expect(repository.find(record.scope, record.key, record.callerSubject)).resolves.toMatchObject({
      responseStatus: 202,
      responseBody: response,
      resourceId: response.id,
    });
  });

  it('releases an incomplete reservation only with confirmed pre-dispatch proof', async () => {
    const record = reservation();
    await repository.reserve(record);
    await repository.releasePreDispatch(record.scope, record.key, record.callerSubject, {
      dispatch: 'NOT_DISPATCHED', reason: 'GATEWAY_UNAVAILABLE',
    });

    await expect(repository.find(record.scope, record.key, record.callerSubject)).resolves.toBeNull();
  });

  it('never purges expired incomplete, PENDING or REVIEW_REQUIRED operations', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const purgeAt = new Date(expiresAt.getTime() + 60_000);
    const pendingPayment = createPaymentFixture(125_000, 'COP', {
      id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID(),
    });
    await unitOfWork.transaction(({ payments }) => payments.save(pendingPayment));

    const pending = reservation({ resourceId: pendingPayment.id, expiresAt });
    const review = reservation({ expiresAt });
    const completed = reservation({ expiresAt });
    const incomplete = reservation({ expiresAt });
    for (const record of [pending, review, completed, incomplete]) await repository.reserve(record);
    await repository.complete(pending.scope, pending.key, pending.callerSubject, 202, { payment: { status: 'PENDING' } }, pendingPayment.id);
    await repository.complete(review.scope, review.key, review.callerSubject, 202, { payment: { status: 'REVIEW_REQUIRED' } }, randomUUID());
    await repository.complete(completed.scope, completed.key, completed.callerSubject, 201, { payment: { status: 'APPROVED' } }, randomUUID());

    await expect(repository.purgeExpired(purgeAt)).resolves.toBe(1);
    for (const record of [pending, review, incomplete]) {
      await expect(repository.find(record.scope, record.key, record.callerSubject)).resolves.not.toBeNull();
    }
    await expect(repository.find(completed.scope, completed.key, completed.callerSubject)).resolves.toBeNull();
  });
});
