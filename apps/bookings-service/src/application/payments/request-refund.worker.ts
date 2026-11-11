import type { BookingReaderPort } from '@bookings/application/ports/payment-saga.port';
import type { PaymentRefundsPort, RefundWorkPort } from '@bookings/application/ports/payment-refunds.port';
import { DomainError } from '@bookings/domain/shared/domain-error';

export class RequestRefundWorker {
  public constructor(private readonly work: RefundWorkPort, private readonly bookings: BookingReaderPort, private readonly refunds: PaymentRefundsPort) {}
  public async runOnce(limit = 10): Promise<number> {
    const claimed = await this.work.claim(limit, 'REQUEST_REFUND');
    for (const item of claimed) {
      try {
        const booking = await this.bookings.findById(item.bookingId);
        if (!booking?.paymentOrderId) throw new DomainError('NOT_FOUND');
        const command = { bookingId: booking.id, paymentOrderId: booking.paymentOrderId, amount: item.amount, mode: booking.cancelledBy === 'OWNER' ? 'FULL' as const : 'POLICY' as const, ...(booking.cancellationPolicyVersion ? { policyVersion: booking.cancellationPolicyVersion } : {}) };
        await this.refunds.requestRefund(command, item.idempotencyKey);
        await this.work.succeededRefund(item.id);
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 80) : 'UNKNOWN';
        if (error instanceof DomainError && error.code === 'DEPENDENCY_UNAVAILABLE') await this.work.retry(item.id, item.attempts, code);
        else await this.work.dead(item.id, code);
      }
    }
    return claimed.length;
  }
}
