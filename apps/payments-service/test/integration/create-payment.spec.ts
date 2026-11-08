import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaPaymentRepository } from '../../src/infrastructure/persistence/prisma/payment.repository';
import { PrismaIdempotencyRepository } from '../../src/infrastructure/persistence/prisma/idempotency.repository';
import { MockPaymentGatewayAdapter } from '../../src/infrastructure/gateway/mock-payment-gateway.adapter';
import { CreatePayment } from '../../src/application/payments/create-payment.use-case';
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
      payments: new PrismaPaymentRepository(prismaService),
      idempotency: new PrismaIdempotencyRepository(prismaService),
      gateway: gatewayPort,
      clock: { now: () => new Date() },
      config,
    });
  }

  function input(overrides: Partial<{
    bookingId: string;
    payerUserId: string;
    amountMinor: number;
    currency: 'COP' | 'USD';
    paymentMethod: { type: 'CARD_TOKEN'; token: string };
    idempotencyKey: string;
    callerSubject: string;
  }> = {}) {
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
    const createRow = (id: string, status: 'PENDING' | 'APPROVED') => prisma.payment.create({
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

    const results = await Promise.all(Array.from({ length: 12 }, () => useCase.execute(command)));

    expect(results.filter((result: { replayed: boolean }) => result.replayed === false)).toHaveLength(1);
    expect(results.filter((result: { replayed: boolean }) => result.replayed === true)).toHaveLength(11);
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
});
