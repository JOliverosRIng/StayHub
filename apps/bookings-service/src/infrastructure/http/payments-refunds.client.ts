import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_REFUNDS_PORT, type PaymentRefundsPort, type RequestRefundCommand } from '@bookings/application/ports/payment-refunds.port';
import { SERVICE_TOKEN_PORT, type ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import { DomainError } from '@bookings/domain/shared/domain-error';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { isUuid, paymentsIdempotencyKey, toMinorUnits } from './payments-contract';

@Injectable()
export class PaymentsRefundsClient implements PaymentRefundsPort {
  public static readonly token = PAYMENT_REFUNDS_PORT;
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig, @Inject(SERVICE_TOKEN_PORT) private readonly tokens: ServiceTokenPort) {}

  public async requestRefund(command: RequestRefundCommand, idempotencyKey: string): Promise<{ refundId: string; status: 'PENDING' | 'COMPLETED' | 'FAILED' }> {
    const token = await this.tokens.getToken('payments-service', 'payments:refund');
    const amountMinor = toMinorUnits(command.amount);
    let response: Response;
    try {
      response = await fetch(`${this.config.paymentsUrl}/payments/${command.paymentOrderId}/refund`, {
        method: 'POST', signal: AbortSignal.timeout(this.config.dependencyTimeoutMs),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': paymentsIdempotencyKey(idempotencyKey) },
        body: JSON.stringify({ amountMinor, reason: command.mode === 'FULL' ? 'OWNER_CANCELLATION' : 'GUEST_CANCELLATION' }),
      });
    } catch { throw new DomainError('DEPENDENCY_UNAVAILABLE'); }
    if (!response.ok) throw new DomainError(response.status >= 500 ? 'DEPENDENCY_UNAVAILABLE' : 'PAYMENT_REJECTED');
    if (response.status !== 201 && response.status !== 202) throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
    const body = await response.json() as { id?: unknown; paymentId?: unknown; amountMinor?: unknown; status?: unknown };
    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED'];
    if (!isUuid(body.id) || body.paymentId !== command.paymentOrderId || body.amountMinor !== amountMinor || typeof body.status !== 'string' || !validStatuses.includes(body.status)) throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
    return { refundId: body.id, status: body.status as 'PENDING' | 'COMPLETED' | 'FAILED' };
  }
}
