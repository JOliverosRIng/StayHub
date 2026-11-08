import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { MockPaymentGatewayAdapter } from '../../src/infrastructure/gateway/mock-payment-gateway.adapter';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';

const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL ?? '';
const integrationDescribe = databaseUrl.length > 0 ? describe : describe.skip;

integrationDescribe('mock gateway durable ledger with PostgreSQL restart', () => {
  const secret = 'integration-test-secret-with-at-least-thirty-two-characters';
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
    const dispatch = await firstAdapter.charge({
      paymentId: randomUUID(),
      token: 'tok_gateway_timeout',
      amountMinor: 125_000,
      currency: 'COP',
      idempotencyReference,
    });
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
    expect(JSON.stringify(ledger)).not.toContain('tok_gateway_timeout');
  });
});
