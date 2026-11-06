import { firstValueFrom, of } from 'rxjs';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '@bookings/modules/health/health.controller';
import { TraceInterceptor } from '@bookings/interfaces/http/trace.interceptor';
import { EnvironmentServiceTokenProvider } from '@bookings/infrastructure/security/environment-service-token.provider';
import { BookingsMetrics } from '@bookings/infrastructure/observability/bookings-metrics';
import { ExpirePaymentHoldsWorker } from '@bookings/application/payments/expire-payment-holds.worker';
import { ApplyPaymentResultUseCase } from '@bookings/application/payments/apply-payment-result.use-case';
import { ApplyRefundResultUseCase } from '@bookings/application/payments/apply-refund-result.use-case';

describe('health, tracing and small adapters', () => {
  it('reports liveness and readiness from the database probe', async () => {
    const ready = new HealthController({ isReady: async () => true } as never);
    expect(ready.live()).toEqual({ status: 'ok' });
    await expect(ready.ready()).resolves.toEqual({ status: 'ready' });
    const notReady = new HealthController({ isReady: async () => false } as never);
    await expect(notReady.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
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

  it('resolves outbound service tokens from env and fails closed when absent', async () => {
    const provider = new EnvironmentServiceTokenProvider();
    process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN = 'token-value';
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN_FILE;
    await expect(provider.getToken()).resolves.toBe('token-value');
    delete process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN;
    expect(() => provider.getToken()).toThrow('SERVICE_CREDENTIALS_UNAVAILABLE');
  });

  it('records metrics and delegates expiry/result use cases', async () => {
    expect(() => new BookingsMetrics().increment('test.metric')).not.toThrow();
    expect(() => new BookingsMetrics().duration('test.latency', 12)).not.toThrow();
    const expiry = { expire: jest.fn(async () => 3) };
    await expect(new ExpirePaymentHoldsWorker(expiry).runOnce()).resolves.toBe(3);
    const payment = { apply: jest.fn(async () => 'APPLIED' as const) };
    await expect(new ApplyPaymentResultUseCase(payment).execute({ eventId: 'e', eventType: 'payment.v1.confirmed', schemaVersion: 1, occurredAt: '2035-01-01T00:00:00.000Z', bookingId: 'b', paymentOrderId: 'o' }, 'hash')).resolves.toBe('APPLIED');
    const refund = { apply: jest.fn(async () => 'DUPLICATE' as const) };
    await expect(new ApplyRefundResultUseCase(refund).execute({ eventId: 'e', eventType: 'payment.v1.refund-completed', schemaVersion: 1, occurredAt: '2035-01-01T00:00:00.000Z', bookingId: 'b', paymentOrderId: 'o', refundId: 'r' }, 'hash')).resolves.toBe('DUPLICATE');
  });
});
