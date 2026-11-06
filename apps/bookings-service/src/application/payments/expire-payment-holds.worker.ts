import type { PaymentHoldExpiryPort } from '@bookings/application/ports/payment-saga.port';

export class ExpirePaymentHoldsWorker {
  public constructor(private readonly expiry: PaymentHoldExpiryPort) {}
  public runOnce(limit = 100): Promise<number> { return this.expiry.expire(limit); }
}
