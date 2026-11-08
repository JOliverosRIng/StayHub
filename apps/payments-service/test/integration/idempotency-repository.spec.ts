import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaIdempotencyRepository } from '../../src/infrastructure/persistence/prisma/idempotency.repository';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';
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
  }> = {}) {
    return {
      scope: 'charge',
      key: randomUUID(),
      callerSubject: 'booking-service',
      requestFingerprint: 'a'.repeat(64),
      responseStatus: null,
      responseBody: null,
      resourceId: null,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  it('atomically reserves a key and returns the existing record on a duplicate reservation', async () => {
    const record = reservation();
    const [first, second] = await Promise.all([repository.reserve(record), repository.reserve(record)]);

    expect(first).toEqual(second);
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

    const pending = reservation({
      responseStatus: 202,
      responseBody: { payment: { status: 'PENDING' } },
      resourceId: pendingPayment.id,
      expiresAt,
    });
    const review = reservation({
      responseStatus: 202,
      responseBody: { payment: { status: 'REVIEW_REQUIRED' } },
      expiresAt,
    });
    const completed = reservation({
      responseStatus: 201,
      responseBody: { payment: { status: 'APPROVED' } },
      expiresAt,
    });
    const incomplete = reservation({ expiresAt });
    for (const record of [pending, review, completed, incomplete]) await repository.reserve(record);

    await expect(repository.purgeExpired(purgeAt)).resolves.toBe(1);
    for (const record of [pending, review, incomplete]) {
      await expect(repository.find(record.scope, record.key, record.callerSubject)).resolves.not.toBeNull();
    }
    await expect(repository.find(completed.scope, completed.key, completed.callerSubject)).resolves.toBeNull();
  });
});
