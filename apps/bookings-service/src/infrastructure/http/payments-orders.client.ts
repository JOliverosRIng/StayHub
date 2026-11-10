import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_ORDERS_PORT, type CreatePaymentOrder, type PaymentOrdersPort } from '@bookings/application/ports/payment-orders.port';
import { SERVICE_TOKEN_PORT, type ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { isUuid, mockPaymentToken, paymentsIdempotencyKey, toMinorUnits } from './payments-contract';

interface PaymentResponse {
  id?: unknown;
  bookingId?: unknown;
  payerUserId?: unknown;
  amountMinor?: unknown;
  currency?: unknown;
  status?: unknown;
}

@Injectable()
export class PaymentsOrdersClient implements PaymentOrdersPort {
  public static readonly token = PAYMENT_ORDERS_PORT;
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig, @Inject(SERVICE_TOKEN_PORT) private readonly tokens: ServiceTokenPort) {}
  public async createOrder(command: CreatePaymentOrder, idempotencyKey: string): Promise<{ paymentId: string; status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'FAILED' }> {
    const token = await this.tokens.getToken('payments-service', 'payments:charge');
    const amountMinor = toMinorUnits(command.amount);
    let response: Response;
    try { response = await fetch(`${this.config.paymentsUrl}/payments`, { method: 'POST', signal: AbortSignal.timeout(this.config.dependencyTimeoutMs), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': paymentsIdempotencyKey(idempotencyKey) }, body: JSON.stringify({ bookingId: command.bookingId, payerUserId: command.guestId, amountMinor, currency: command.currency, paymentMethod: { type: 'CARD_TOKEN', token: mockPaymentToken(command.bookingId, this.config.paymentsMockToken) } }) }); }
    catch { throw new DomainError('DEPENDENCY_UNAVAILABLE'); }
    if (!response.ok) throw new DomainError(response.status >= 500 ? 'DEPENDENCY_UNAVAILABLE' : 'PAYMENT_REJECTED');
    const body = await response.json() as PaymentResponse;
    const validStatuses = ['PENDING', 'APPROVED', 'DECLINED', 'FAILED'];
    if (!isUuid(body.id) || body.bookingId !== command.bookingId || body.payerUserId !== command.guestId || body.amountMinor !== amountMinor || body.currency !== command.currency || typeof body.status !== 'string' || !validStatuses.includes(body.status)) throw new DomainError('DEPENDENCY_INVALID_RESPONSE');
    return { paymentId: body.id, status: body.status as 'PENDING' | 'APPROVED' | 'DECLINED' | 'FAILED' };
  }
}
