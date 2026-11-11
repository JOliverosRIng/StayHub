import { randomUUID } from 'node:crypto';
import type { ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { PaymentsOrdersClient } from '@bookings/infrastructure/http/payments-orders.client';
import { PaymentsRefundsClient } from '@bookings/infrastructure/http/payments-refunds.client';

const paymentsUrl = process.env.BOOKINGS_PAYMENTS_E2E_URL;
const chargeToken = process.env.BOOKINGS_PAYMENTS_E2E_CHARGE_TOKEN;
const refundToken = process.env.BOOKINGS_PAYMENTS_E2E_REFUND_TOKEN;
const enabled = Boolean(paymentsUrl && chargeToken && refundToken);
const describeReal = enabled ? describe : describe.skip;

describeReal('Bookings REST integration with real Payments', () => {
  const tokens: ServiceTokenPort = {
    getToken: async (_audience, scope) => {
      if (scope === 'payments:charge' && chargeToken) return chargeToken;
      if (scope === 'payments:refund' && refundToken) return refundToken;
      throw new Error(`Missing test token for ${scope}`);
    },
  };
  const config = (paymentsMockToken: string): BookingsConfig => ({
    paymentsUrl: paymentsUrl!, paymentsMockToken, dependencyTimeoutMs: 5_000,
  } as BookingsConfig);

  it('creates an approved payment and replays it without a duplicate charge', async () => {
    const client = new PaymentsOrdersClient(config('tok_approved'), tokens);
    const command = { bookingId: randomUUID(), guestId: randomUUID(), amount: '1250.00', currency: 'USD' };
    const key = randomUUID();
    const created = await client.createOrder(command, key);
    const replay = await client.createOrder(command, key);
    expect(created).toMatchObject({ paymentId: expect.any(String), status: 'APPROVED' });
    expect(replay).toEqual(created);
  });

  it('returns the authoritative declined result from Payments', async () => {
    const client = new PaymentsOrdersClient(config('tok_declined_funds'), tokens);
    const result = await client.createOrder({ bookingId: randomUUID(), guestId: randomUUID(), amount: '75.00', currency: 'USD' }, randomUUID());
    expect(result).toMatchObject({ paymentId: expect.any(String), status: 'DECLINED' });
  });

  it('refunds an approved payment and replays it without a duplicate refund', async () => {
    const orderClient = new PaymentsOrdersClient(config('tok_approved'), tokens);
    const refundClient = new PaymentsRefundsClient(config('tok_approved'), tokens);
    const bookingId = randomUUID();
    const payment = await orderClient.createOrder({ bookingId, guestId: randomUUID(), amount: '300.00', currency: 'USD' }, randomUUID());
    expect(payment.status).toBe('APPROVED');
    const command = { bookingId, paymentOrderId: payment.paymentId, amount: '300.00', mode: 'POLICY' as const, policyVersion: 'e2e-v1' };
    const key = randomUUID();
    const created = await refundClient.requestRefund(command, key);
    const replay = await refundClient.requestRefund(command, key);
    expect(created).toMatchObject({ refundId: expect.any(String), status: 'COMPLETED' });
    expect(replay).toEqual(created);
  });
});
