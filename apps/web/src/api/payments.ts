/**
 * FE-031 (RQ-07) — client-side SIMULATED payment gateway.
 *
 * Contract alignment: `payments-service` is INTERNAL — it is NOT published on the Gateway and is
 * driven only by `bookings-service` with a service JWT (`payments:charge`). The web client never
 * calls `/payments`. Per the payments contract the gateway itself is simulated (mock). This module
 * simulates that gateway on the client so the guest can complete the RQ-07 flow; in production the
 * booking is confirmed server-side by `bookings-service` via events, and the booking
 * (`GET /bookings/:id`) remains the source of truth for its status.
 *
 * External dependency: no guest-facing payment endpoint exists on the Gateway in this increment.
 */

export type ChargeStatus = 'APPROVED' | 'DECLINED';

export interface ChargeResult {
  status: ChargeStatus;
  /** Mirrors the payments contract `FailureCode`; null when approved. */
  failureCode: 'CARD_DECLINED' | null;
}

export interface ChargeInput {
  /** ISO 4217 minor units (COP/USD = 2 decimals). */
  amountMinor: number;
  currency: string;
  /** Opaque card token (never a card number), per the contract's `PaymentMethod.token`. */
  token: string;
}

/** Opaque tokens containing this hint are declined — deterministic for development and tests. */
export const SIMULATED_DECLINE_HINT = 'declina';

/** Contract token shape: `^[A-Za-z0-9_-]{8,64}$`. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Converts a decimal string amount (e.g. `"435.00"`) to ISO 4217 minor units (`43500`). */
export function toMinorUnits(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/** Simulates the gateway charge. Async like a real call; deterministic outcome (no randomness). */
export async function simulateCharge(input: ChargeInput): Promise<ChargeResult> {
  await Promise.resolve();
  const declined = !TOKEN_PATTERN.test(input.token) || input.token.includes(SIMULATED_DECLINE_HINT);
  return declined ? { status: 'DECLINED', failureCode: 'CARD_DECLINED' } : { status: 'APPROVED', failureCode: null };
}

export function chargeMessage(result: ChargeResult): string {
  return result.status === 'APPROVED'
    ? '¡Pago aprobado! Tu reserva está confirmada.'
    : 'El pago fue rechazado. Revisa tu método de pago e inténtalo de nuevo.';
}
