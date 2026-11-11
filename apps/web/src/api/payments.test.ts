import { describe, expect, it } from 'vitest';
import { SIMULATED_DECLINE_HINT, chargeMessage, simulateCharge, toMinorUnits } from './payments';

/**
 * FE-031 (RQ-07) — simulated payment gateway, client side.
 *
 * Contract note: `payments-service` is INTERNAL (not published on the Gateway) and is driven by
 * `bookings-service` via a service JWT; the web client never calls `/payments`. Per the payments
 * contract the gateway itself is simulated. This module simulates that gateway on the client so the
 * guest can complete the RQ-07 flow; the booking (`GET /bookings/:id`) stays the source of truth.
 */

describe('simulateCharge', () => {
  it('approves a well-formed card token', async () => {
    await expect(simulateCharge({ amountMinor: 43500, currency: 'USD', token: 'tok_valido_1234' }))
      .resolves.toEqual({ status: 'APPROVED', failureCode: null });
  });

  it('declines a token flagged for decline (deterministic simulation)', async () => {
    await expect(simulateCharge({ amountMinor: 43500, currency: 'USD', token: `tok_${SIMULATED_DECLINE_HINT}_1` }))
      .resolves.toEqual({ status: 'DECLINED', failureCode: 'CARD_DECLINED' });
  });

  it('declines an invalid (too short) token without charging', async () => {
    await expect(simulateCharge({ amountMinor: 43500, currency: 'USD', token: 'short' }))
      .resolves.toMatchObject({ status: 'DECLINED' });
  });
});

describe('payment helpers', () => {
  it('converts a decimal amount string to minor units', () => {
    expect(toMinorUnits('435.00')).toBe(43500);
    expect(toMinorUnits('350000.00')).toBe(35000000);
    expect(toMinorUnits('0.99')).toBe(99);
  });

  it('maps charge results to Spanish UI copy', () => {
    expect(chargeMessage({ status: 'APPROVED', failureCode: null })).toMatch(/aprobado/i);
    expect(chargeMessage({ status: 'DECLINED', failureCode: 'CARD_DECLINED' })).toMatch(/rechaz/i);
  });
});
