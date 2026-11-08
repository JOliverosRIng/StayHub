import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import { MockPaymentGatewayAdapter } from '../../src/infrastructure/gateway/mock-payment-gateway.adapter';
import { CreatePayment, type CreatePaymentInput } from '../../src/application/payments/create-payment.use-case';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import type { PaymentGatewayPort } from '../../src/application/ports/payment-gateway.port';
import { MOCK_GATEWAY_TOKENS, TEST_TOKEN_HMAC_SECRET } from '../fixtures/mock-gateway.fixture';

const secret = TEST_TOKEN_HMAC_SECRET;
const config = {
  tokenHmacSecret: secret,
  allowedCurrencies: ['COP', 'USD'],
  maxAmountMinor: 9_000_000_000_000,
  idempotencyTtlHours: 48,
  gatewayTimeoutMs: 1_000,
  gatewayCircuitFailureThreshold: 3,
  gatewayCircuitResetMs: 100,
  reconcilerIntervalMs: 30_000,
} as unknown as PaymentsConfig;

describe('CreatePayment with PostgreSQL 16', () => {
  let prisma: PrismaClient;
  let gateway: MockPaymentGatewayAdapter;

  beforeAll(async () => {
    const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('PAYMENTS_TEST_DATABASE_URL is required');
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    gateway = new MockPaymentGatewayAdapter(prisma as unknown as PrismaService, config);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function createUseCase(gatewayPort: PaymentGatewayPort = gateway): CreatePayment {
    const prismaService = prisma as unknown as PrismaService;
    return new CreatePayment({
      unitOfWork: new PrismaUnitOfWork(prismaService),
      gateway: gatewayPort,
      clock: { now: () => new Date() },
      config,
    });
  }

  function input(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
    return {
      bookingId: randomUUID(),
      payerUserId: randomUUID(),
      amountMinor: 125_000,
      currency: 'COP' as const,
      paymentMethod: { type: 'CARD_TOKEN' as const, token: MOCK_GATEWAY_TOKENS.approved },
      idempotencyKey: randomUUID(),
      callerSubject: 'booking-service',
      ...overrides,
    };
  }

  it('uses the partial unique index to reject a second active payment for a booking', async () => {
    const bookingId = randomUUID();
    const createRow = async (id: string, status: 'PENDING' | 'APPROVED'): Promise<void> => {
      await prisma.payment.create({
      data: {
        id,
        bookingId,
        payerUserId: randomUUID(),
        amountMinor: 125_000n,
        currency: 'COP',
        status,
        paymentMethodFingerprint: id.replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
      },
      });
    };

    const results = await Promise.allSettled([
      createRow(randomUUID(), 'PENDING'),
      createRow(randomUUID(), 'APPROVED'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.payment.count({ where: { bookingId } })).toBe(1);
  });

  it('serializes simultaneous requests with the same key to one payment and one gateway charge', async () => {
    const gatewaySpy = jest.spyOn(gateway, 'charge');
    const useCase = createUseCase();
    const command = input();

    const results = await Promise.allSettled(Array.from({ length: 12 }, () => useCase.execute(command)));

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled.length).toBeGreaterThan(0);
    for (const result of rejected) expect(result).toMatchObject({ reason: { code: 'STATE_CONFLICT' } });
    expect(gatewaySpy).toHaveBeenCalledTimes(1);
    expect(await prisma.payment.count({ where: { bookingId: command.bookingId } })).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { key: command.idempotencyKey } })).toBe(1);
  });

  it('allows a new idempotency key after a confirmed decline', async () => {
    const useCase = createUseCase();
    const declinedInput = input({ paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.declinedFunds } });
    const first = await useCase.execute(declinedInput);
    const retry = await useCase.execute({
      ...declinedInput,
      paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
      idempotencyKey: randomUUID(),
    });

    expect(first).toMatchObject({ statusCode: 201, payment: { status: 'DECLINED' } });
    expect(retry).toMatchObject({ statusCode: 201, payment: { status: 'APPROVED' } });
    expect(await prisma.payment.count({ where: { bookingId: declinedInput.bookingId } })).toBe(2);
  });

  it('releases a key only after confirmed pre-dispatch failure and permits a retry', async () => {
    const useCase = createUseCase();
    const preDispatch = input({ paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.gatewayDown } });

    await expect(useCase.execute(preDispatch)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(prisma.payment.findFirst({ where: { bookingId: preDispatch.bookingId } }))
      .resolves.toMatchObject({ status: 'FAILED', failureCode: 'GATEWAY_UNAVAILABLE' });
    await expect(prisma.idempotencyRecord.findFirst({ where: { key: preDispatch.idempotencyKey } })).resolves.toBeNull();

    const retry = await useCase.execute({
      ...preDispatch,
      paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
    });
    expect(retry).toMatchObject({ statusCode: 201, payment: { status: 'APPROVED' } });
    expect(await prisma.payment.count({ where: { bookingId: preDispatch.bookingId } })).toBe(2);
  });

  it('keeps PENDING and the idempotency key when the connection drops after the gateway commits', async () => {
    let chargeCalls = 0;
    const gatewayDropsResponse: PaymentGatewayPort = {
      charge: async (command) => {
        chargeCalls += 1;
        await gateway.charge(command);
        throw new Error('simulated connection loss after provider commit');
      },
      refund: (command) => gateway.refund(command),
      getTransaction: (reference) => gateway.getTransaction(reference),
    };
    const useCase = createUseCase(gatewayDropsResponse);
    const command = input();

    const first = await useCase.execute(command);
    expect(first).toMatchObject({ statusCode: 202, payment: { status: 'PENDING', failureCode: 'GATEWAY_TIMEOUT' } });
    await expect(prisma.payment.findUnique({ where: { id: first.payment.id } })).resolves.toMatchObject({
      status: 'PENDING',
      gatewayReference: first.payment.id,
      failureCode: 'GATEWAY_TIMEOUT',
    });
    await expect(prisma.idempotencyRecord.findFirst({ where: { key: command.idempotencyKey } }))
      .resolves.toMatchObject({ responseStatus: 202, resourceId: first.payment.id });
    await expect(gateway.getTransaction(first.payment.id)).resolves.toMatchObject({ kind: 'approved' });

    const replay = await useCase.execute(command);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(chargeCalls).toBe(1);
  });
});
