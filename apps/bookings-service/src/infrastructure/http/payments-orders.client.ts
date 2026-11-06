import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_ORDERS_PORT, type CreatePaymentOrder, type PaymentOrdersPort } from '@bookings/application/ports/payment-orders.port';
import { SERVICE_TOKEN_PORT, type ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { DomainError } from '@bookings/domain/shared/domain-error';

@Injectable()
export class PaymentsOrdersClient implements PaymentOrdersPort {
  public static readonly token = PAYMENT_ORDERS_PORT;
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig, @Inject(SERVICE_TOKEN_PORT) private readonly tokens: ServiceTokenPort) {}
  public async createOrder(command: CreatePaymentOrder, idempotencyKey: string): Promise<{ paymentOrderId: string; status: 'PENDING' }> {
    const token = await this.tokens.getToken('payments-service', 'payments:orders:create');
    let response: Response;
    try { response = await fetch(`${this.config.paymentsUrl}/internal/v1/payment-orders`, { method: 'POST', signal: AbortSignal.timeout(this.config.dependencyTimeoutMs), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(command) }); }
    catch { throw new DomainError('DEPENDENCY_UNAVAILABLE'); }
    if (!response.ok) throw new DomainError(response.status >= 500 ? 'DEPENDENCY_UNAVAILABLE' : 'PAYMENT_REJECTED');
    const body = await response.json() as { paymentOrderId?: string; status?: string };
    if (!body.paymentOrderId || body.status !== 'PENDING') throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
    return { paymentOrderId: body.paymentOrderId, status: 'PENDING' };
  }
}
