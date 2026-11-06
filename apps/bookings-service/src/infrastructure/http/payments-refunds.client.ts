import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_REFUNDS_PORT, type PaymentRefundsPort, type RequestRefundCommand } from '@bookings/application/ports/payment-refunds.port';
import { SERVICE_TOKEN_PORT, type ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import { DomainError } from '@bookings/domain/shared/domain-error';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';

@Injectable()
export class PaymentsRefundsClient implements PaymentRefundsPort {
  public static readonly token = PAYMENT_REFUNDS_PORT;
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig, @Inject(SERVICE_TOKEN_PORT) private readonly tokens: ServiceTokenPort) {}

  public async requestRefund(command: RequestRefundCommand, idempotencyKey: string): Promise<{ status: 'ACCEPTED' }> {
    const token = await this.tokens.getToken('payments-service', 'payments:refunds:create');
    let response: Response;
    try {
      response = await fetch(`${this.config.paymentsUrl}/internal/v1/refunds`, {
        method: 'POST', signal: AbortSignal.timeout(this.config.dependencyTimeoutMs),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify(command),
      });
    } catch { throw new DomainError('DEPENDENCY_UNAVAILABLE'); }
    if (!response.ok) throw new DomainError(response.status >= 500 ? 'DEPENDENCY_UNAVAILABLE' : 'PAYMENT_REJECTED');
    if (response.status !== 202) throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
    return { status: 'ACCEPTED' };
  }
}
