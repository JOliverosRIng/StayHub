import type { PaymentOrdersPort } from '@bookings/application/ports/payment-orders.port';
import type { BookingReaderPort, PaymentWorkPort } from '@bookings/application/ports/payment-saga.port';

export class CreatePaymentOrderWorker {
  public constructor(private readonly work: PaymentWorkPort, private readonly bookings: BookingReaderPort, private readonly payments: PaymentOrdersPort) {}
  public async runOnce(limit = 10): Promise<number> {
    const claimed = await this.work.claim(limit);
    for (const item of claimed) {
      try { const booking = await this.bookings.findById(item.bookingId); if (!booking) throw new Error('BOOKING_NOT_FOUND'); const result = await this.payments.createOrder({ bookingId: booking.id, guestId: booking.guestId, amount: item.amount, currency: item.currency }, item.idempotencyKey); await this.work.succeeded(item.id, result.paymentId); }
      catch (error) { await this.work.retry(item.id, item.attempts, error instanceof Error ? error.message.slice(0, 80) : 'UNKNOWN'); }
    }
    return claimed.length;
  }
}
