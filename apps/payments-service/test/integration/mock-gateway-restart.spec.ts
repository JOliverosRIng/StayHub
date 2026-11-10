import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { MockPaymentGatewayAdapter } from '../../src/infrastructure/gateway/mock-payment-gateway.adapter';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { MOCK_GATEWAY_TOKENS, TEST_TOKEN_HMAC_SECRET } from '../fixtures/mock-gateway.fixture';
import { createChargeCommandFixture } from '../fixtures/payments.fixture';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL ?? '';
describe('mock gateway durable ledger with PostgreSQL restart', () => {
  const secret = TEST_TOKEN_HMAC_SECRET;
  const config = {
    tokenHmacSecret: secret,
    gatewayTimeoutMs: 1_000,
    gatewayCircuitFailureThreshold: 3,
    gatewayCircuitResetMs: 100,
  } as PaymentsConfig;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('recovers a persisted approval after the adapter and Prisma client restart', async () => {
    const idempotencyReference = `restart-${randomUUID()}`;
    const firstAdapter = new MockPaymentGatewayAdapter(prisma as unknown as PrismaService, config);
    const dispatch = await firstAdapter.charge(createChargeCommandFixture({
      paymentId: randomUUID(),
      token: MOCK_GATEWAY_TOKENS.gatewayTimeout,
      amountMinor: 125_000,
      idempotencyReference,
    }));
    expect(dispatch.kind).toBe('uncertain');
    if (dispatch.kind !== 'uncertain' || !dispatch.reference) throw new Error('Expected an opaque ledger reference');
    await prisma.$disconnect();

    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const restartedAdapter = new MockPaymentGatewayAdapter(prisma as unknown as PrismaService, config);
    await expect(restartedAdapter.getTransaction(dispatch.reference)).resolves.toEqual({
      kind: 'approved',
      reference: dispatch.reference,
    });
    const ledger = await prisma.mockGatewayOperation.findUnique({
      where: { operationRefHash: dispatch.reference },
    });
    expect(ledger).toMatchObject({ kind: 'CHARGE', result: 'APPROVED' });
    expect(JSON.stringify(ledger)).not.toContain(MOCK_GATEWAY_TOKENS.gatewayTimeout);
  });

  it('preserves an authoritative UNKNOWN result across instances and Prisma restart', async () => {
    const firstAdapter = new MockPaymentGatewayAdapter(prisma as unknown as PrismaService, config);
    const dispatch = await firstAdapter.charge(createChargeCommandFixture({
      paymentId: randomUUID(),
      token: MOCK_GATEWAY_TOKENS.gatewayUnknown,
      amountMinor: 75_000,
      idempotencyReference: `unknown-${randomUUID()}`,
    }));
    expect(dispatch).toMatchObject({ kind: 'uncertain' });
    if (dispatch.kind !== 'uncertain' || !dispatch.reference) throw new Error('Expected an opaque UNKNOWN ledger reference');

    const concurrentAdapter = new MockPaymentGatewayAdapter(prisma as unknown as PrismaService, config);
    await expect(concurrentAdapter.getTransaction(dispatch.reference)).resolves.toEqual({ kind: 'unknown' });
    await prisma.$disconnect();
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();

    const restartedAdapter = new MockPaymentGatewayAdapter(prisma as unknown as PrismaService, config);
    await expect(restartedAdapter.getTransaction(dispatch.reference)).resolves.toEqual({ kind: 'unknown' });
    await expect(prisma.mockGatewayOperation.findUnique({ where: { operationRefHash: dispatch.reference } }))
      .resolves.toMatchObject({ kind: 'CHARGE', result: 'UNKNOWN' });
  });
});
