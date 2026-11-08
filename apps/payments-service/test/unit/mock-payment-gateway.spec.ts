import { createHmac } from 'node:crypto';
import { MockPaymentGatewayAdapter } from '../../src/infrastructure/gateway/mock-payment-gateway.adapter';
import { GatewayCircuitBreaker, GatewayCircuitOpenError, GatewayTimeoutError } from '../../src/infrastructure/gateway/gateway-circuit-breaker';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import type { ChargeCommand } from '../../src/application/ports/payment-gateway.port';

interface LedgerRow {
  operationRefHash: string;
  kind: 'CHARGE' | 'REFUND';
  result: 'APPROVED' | 'DECLINED' | 'REFUND_COMPLETED' | 'REFUND_FAILED' | 'UNKNOWN';
  failureCode: string | null;
  refundFixtureResult: 'NORMAL' | 'REFUND_DECLINED' | null;
  resolvedAt: Date | null;
}

const secret = 'test-secret-with-at-least-thirty-two-characters';
const config = {
  tokenHmacSecret: secret,
  gatewayTimeoutMs: 100,
  gatewayCircuitFailureThreshold: 2,
  gatewayCircuitResetMs: 100,
} as PaymentsConfig;

function inMemoryPrisma(): { readonly prisma: PrismaService; readonly rows: Map<string, LedgerRow> } {
  const rows = new Map<string, LedgerRow>();
  const mockGatewayOperation = {
    findUnique: ({ where }: { where: { operationRefHash: string } }): Promise<LedgerRow | null> =>
      Promise.resolve(rows.get(where.operationRefHash) ?? null),
    create: ({ data }: { data: LedgerRow }): Promise<LedgerRow> => {
      if (rows.has(data.operationRefHash)) return Promise.reject(new Error('unique conflict'));
      rows.set(data.operationRefHash, data);
      return Promise.resolve(data);
    },
  };
  return { prisma: { mockGatewayOperation } as unknown as PrismaService, rows };
}

const charge = (token: string, idempotencyReference = 'opaque-charge-1'): ChargeCommand => ({
  paymentId: 'payment-1', token, amountMinor: 1200, currency: 'COP' as const, idempotencyReference,
});

describe('MockPaymentGatewayAdapter', () => {
  it('stores approved and declined results idempotently without persisting tokens', async () => {
    const { prisma, rows } = inMemoryPrisma();
    const adapter = new MockPaymentGatewayAdapter(prisma, config);
    const approved = await adapter.charge(charge('tok_approved'));
    const retried = await adapter.charge(charge('tok_declined_funds'));
    const declined = await adapter.charge(charge('tok_declined_fraud', 'opaque-charge-2'));

    expect(approved.kind).toBe('approved');
    expect(retried).toEqual(approved);
    expect(declined).toMatchObject({ kind: 'declined', failureCode: 'SUSPECTED_FRAUD' });
    expect(JSON.stringify([...rows.values()])).not.toContain('tok_');
    expect([...rows.keys()]).toEqual([
      createHmac('sha256', secret).update('CHARGE\0opaque-charge-1').digest('hex'),
      createHmac('sha256', secret).update('CHARGE\0opaque-charge-2').digest('hex'),
    ]);
  });

  it('persists a timed-out approval and a fresh adapter can recover it', async () => {
    const { prisma, rows } = inMemoryPrisma();
    const firstInstance = new MockPaymentGatewayAdapter(prisma, config);
    const result = await firstInstance.charge(charge('tok_gateway_timeout'));
    expect(result.kind).toBe('uncertain');
    expect(rows.size).toBe(1);
    const reference = result.kind === 'uncertain' ? result.reference : '';
    const restartedInstance = new MockPaymentGatewayAdapter(prisma, config);
    await expect(restartedInstance.getTransaction(reference ?? '')).resolves.toMatchObject({ kind: 'approved' });
  });

  it('fails before dispatch for gateway_down and simulates refund rejection from the charge ledger', async () => {
    const { prisma, rows } = inMemoryPrisma();
    const adapter = new MockPaymentGatewayAdapter(prisma, config);
    await expect(adapter.charge(charge('tok_gateway_down'))).resolves.toEqual({
      kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE',
    });
    expect(rows.size).toBe(0);

    const approved = await adapter.charge(charge('tok_refund_fails'));
    if (approved.kind !== 'approved') throw new Error('Fixture must approve charge');
    await expect(adapter.refund({
      refundId: 'refund-1', paymentReference: approved.reference, amountMinor: 1200,
      currency: 'COP', idempotencyReference: 'opaque-refund-1',
    })).resolves.toMatchObject({ kind: 'failed', failureCode: 'CARD_DECLINED' });
  });

  it('returns unknown for a transaction absent from the durable ledger', async () => {
    const { prisma } = inMemoryPrisma();
    await expect(new MockPaymentGatewayAdapter(prisma, config).getTransaction('a'.repeat(64)))
      .resolves.toEqual({ kind: 'unknown' });
  });
});

describe('GatewayCircuitBreaker', () => {
  it('opens after failures, times out slow operations, and allows one half-open probe', async () => {
    let now = 0;
    const breaker = new GatewayCircuitBreaker({ failureThreshold: 1, resetMs: 50, timeoutMs: 5, now: (): number => now });
    await expect(breaker.execute(() => new Promise<void>(() => undefined))).rejects.toBeInstanceOf(GatewayTimeoutError);
    await expect(breaker.execute(() => Promise.resolve('blocked'))).rejects.toBeInstanceOf(GatewayCircuitOpenError);
    now = 51;
    await expect(breaker.execute(() => Promise.resolve('recovered'))).resolves.toBe('recovered');
    await expect(breaker.execute(() => Promise.resolve('closed'))).resolves.toBe('closed');
  });
});
