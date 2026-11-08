import { Money } from '../../src/domain/shared/money';
import { Payment } from '../../src/domain/payments/payment.entity';
import type { PaymentStatusEvidence } from '../../src/domain/payments/payment-status';
import type { ChargeCommand } from '../../src/application/ports/payment-gateway.port';

export const TEST_PAYMENT_ID = '56ac8df3-4ab6-48d2-8248-37ec830c9131';
export const TEST_BOOKING_ID = 'c23c61c8-1ccb-4c3f-932b-b62505420aae';
export const TEST_PAYER_ID = 'b73958c2-2ecb-46a2-bc93-b1cba20f9898';
export const TEST_EVIDENCE: PaymentStatusEvidence = { source: 'test-gateway', reference: 'test-operation-1' };

export function createPaymentFixture(
  amountMinor = 35_000_000,
  currency: 'COP' | 'USD' = 'COP',
  overrides: Partial<{ id: string; bookingId: string; payerUserId: string }> = {},
): Payment {
  return Payment.create({
    id: overrides.id ?? TEST_PAYMENT_ID,
    bookingId: overrides.bookingId ?? TEST_BOOKING_ID,
    payerUserId: overrides.payerUserId ?? TEST_PAYER_ID,
    paymentMethodFingerprint: 'a'.repeat(64),
    amount: Money.fromMinor(amountMinor, currency),
  });
}

export function createChargeCommandFixture(
  overrides: Partial<ChargeCommand> = {},
): ChargeCommand {
  return {
    paymentId: TEST_PAYMENT_ID,
    token: 'tok_approved',
    amountMinor: 35_000_000,
    currency: 'COP',
    idempotencyReference: 'opaque-charge-fixture-1',
    ...overrides,
  };
}
