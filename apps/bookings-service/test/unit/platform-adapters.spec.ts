import { firstValueFrom, of } from 'rxjs';
import { ServiceUnavailableException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthController } from '@bookings/modules/health/health.controller';
import { TraceInterceptor } from '@bookings/interfaces/http/trace.interceptor';
import { EnvironmentServiceTokenProvider } from '@bookings/infrastructure/security/environment-service-token.provider';
import { BookingsMetrics } from '@bookings/infrastructure/observability/bookings-metrics';
import { NotificationDeliveryHealth } from '@bookings/infrastructure/observability/notification-delivery-health';
import { ExpirePaymentHoldsWorker } from '@bookings/application/payments/expire-payment-holds.worker';
import { ApplyPaymentResultUseCase } from '@bookings/application/payments/apply-payment-result.use-case';
import { ApplyRefundResultUseCase } from '@bookings/application/payments/apply-refund-result.use-case';

describe('health, tracing and small adapters', () => {
  it('reports liveness and readiness from database, consumer and notification health', async () => {
    const prisma = { isReady: async () => true };
    const consumer = { isHealthy: () => true };
    const notificationsUp = { snapshot: () => ({ state: 'up', lastSuccessAt: '2030-01-01T00:00:00.000Z', lastErrorCode: null }) };
    const ready = new HealthController(prisma as never, consumer as never, notificationsUp as never);
    expect(ready.live()).toEqual({ status: 'ok' });
    await expect(ready.ready()).resolves.toMatchObject({ status: 'ready', database: 'up', paymentsEvents: 'up', notifications: 'up', canConfirmPayments: true });

    const degraded = new HealthController(prisma as never, consumer as never, { snapshot: () => ({ state: 'degraded', lastSuccessAt: null, lastErrorCode: 'NOTIFICATIONS_UNAVAILABLE' }) } as never);
    await expect(degraded.ready()).resolves.toMatchObject({ status: 'degraded', notifications: 'degraded', canConfirmPayments: true });

    const notReady = new HealthController({ isReady: async () => false } as never, consumer as never, notificationsUp as never);
    await expect(notReady.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);

    const consumerDown = new HealthController(prisma as never, { isHealthy: () => false } as never, notificationsUp as never);
    await expect(consumerDown.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('tracks notification delivery health transitions', () => {
    const health = new NotificationDeliveryHealth();
    expect(health.snapshot().state).toBe('unknown');
    health.recordFailure('NOTIFICATIONS_UNAVAILABLE');
    expect(health.snapshot()).toMatchObject({ state: 'degraded', lastErrorCode: 'NOTIFICATIONS_UNAVAILABLE' });
    health.recordSuccess();
    expect(health.snapshot()).toMatchObject({ state: 'up', lastErrorCode: null });
    health.recordFailure('NOTIFICATIONS_CONFLICT');
    expect(health.snapshot()).toMatchObject({ state: 'degraded', lastErrorCode: 'NOTIFICATIONS_CONFLICT' });
  });

  it('propagates a safe request id or generates one', async () => {
    const interceptor = new TraceInterceptor();
    const request: { traceId?: string; header: (name: string) => string | undefined } = { header: () => 'trace-1234' };
    const response = { setHeader: jest.fn() };
    await firstValueFrom(interceptor.intercept({ switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as never, { handle: () => of('ok') } as never));
    expect(request.traceId).toBe('trace-1234');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'trace-1234');
    const generated: { traceId?: string; header: () => string | undefined } = { header: () => 'bad' };
    await firstValueFrom(interceptor.intercept({ switchToHttp: () => ({ getRequest: () => generated, getResponse: () => response }) } as never, { handle: () => of('ok') } as never));
    expect(generated.traceId).toBeDefined();
    expect(generated.traceId).not.toBe('bad');
  });

  it('resolves outbound service tokens by audience/scope and fails closed when absent', async () => {
    const provider = new EnvironmentServiceTokenProvider();
    process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN = 'token-value';
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN_FILE;
    delete process.env.BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN_FILE;
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON;
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON_FILE;
    await expect(provider.getToken('accommodations-service', 'accommodations:booking-quote')).resolves.toBe('token-value');
    await expect(provider.getToken('notifications-service', 'notifications:send')).resolves.toBe('token-value');

    process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON = JSON.stringify({
      'payments-service:payments:charge': 'charge-token',
      'payments-service:payments:refund': 'refund-token',
    });
    await expect(provider.getToken('payments-service', 'payments:charge')).resolves.toBe('charge-token');
    await expect(provider.getToken('payments-service', 'payments:refund')).resolves.toBe('refund-token');

    const tokenDirectory = mkdtempSync(join(tmpdir(), 'stayhub-bookings-tokens-'));
    const tokenFile = join(tokenDirectory, 'outbound-tokens.json');
    writeFileSync(tokenFile, JSON.stringify({
      'accommodations-service:accommodations:booking-quote': 'accommodations-token',
    }));
    process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON_FILE = tokenFile;
    await expect(provider.getToken('accommodations-service', 'accommodations:booking-quote')).resolves.toBe('accommodations-token');
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON_FILE;
    rmSync(tokenDirectory, { recursive: true, force: true });

    process.env.BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN = 'notifications-token';
    await expect(provider.getToken('stayhub-notifications-service', 'notifications:send')).resolves.toBe('notifications-token');

    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN;
    delete process.env.BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN;
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON;
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON_FILE;
    expect(() => provider.getToken('payments-service', 'payments:charge')).toThrow('SERVICE_CREDENTIALS_UNAVAILABLE');
  });

  it('records metrics and delegates expiry/result use cases', async () => {
    expect(() => new BookingsMetrics().increment('test.metric')).not.toThrow();
    expect(() => new BookingsMetrics().duration('test.latency', 12)).not.toThrow();
    const expiry = { expire: jest.fn(async () => 3) };
    await expect(new ExpirePaymentHoldsWorker(expiry).runOnce()).resolves.toBe(3);
    const payment = { apply: jest.fn(async () => 'APPLIED' as const) };
    await expect(new ApplyPaymentResultUseCase(payment).execute({ eventId: 'e', eventType: 'payment.v1.approved', schemaVersion: 1, occurredAt: '2035-01-01T00:00:00.000Z', paymentId: 'o', bookingId: 'b', payerUserId: 'p', amountMinor: 100, currency: 'USD' }, 'hash')).resolves.toBe('APPLIED');
    const refund = { apply: jest.fn(async () => 'DUPLICATE' as const) };
    await expect(new ApplyRefundResultUseCase(refund).execute({ eventId: 'e', eventType: 'payment.v1.refunded', schemaVersion: 1, occurredAt: '2035-01-01T00:00:00.000Z', paymentId: 'o', bookingId: 'b', payerUserId: 'p', amountMinor: 100, currency: 'USD', refundId: 'r', refundedAmountMinor: 100, totalRefundedAmountMinor: 100, reason: 'GUEST_CANCELLATION', paymentStatus: 'REFUNDED' }, 'hash')).resolves.toBe('DUPLICATE');
  });
});
