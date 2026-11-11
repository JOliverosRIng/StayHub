import { AccommodationsBookingQuoteClient } from '@bookings/infrastructure/http/accommodations-booking-quote.client';
import { PaymentsOrdersClient } from '@bookings/infrastructure/http/payments-orders.client';
import { PaymentsRefundsClient } from '@bookings/infrastructure/http/payments-refunds.client';
import { paymentsIdempotencyKey } from '@bookings/infrastructure/http/payments-contract';

const config = { accommodationsUrl: 'http://accommodations', paymentsUrl: 'http://payments', dependencyTimeoutMs: 1000 } as never;
const tokens = { getToken: jest.fn(async () => 'service-token') };
const quote = { propertyId: 'p', roomId: 'r', ownerId: 'o', propertyName: 'P', roomName: 'R', propertyStatus: 'PUBLISHED', capacity: 2, basePrice: { amount: '10.00', currency: 'USD' }, propertyVersion: 1, roomUpdatedAt: '2035-01-01T00:00:00.000Z' };
const response = (status: number, body: unknown = {}): Response => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const fetchMock = jest.fn();

describe('outbound HTTP clients', () => {
  beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock as unknown as typeof fetch; });

  it('maps the accommodations quote and forwards the trace id', async () => {
    fetchMock.mockResolvedValue(response(200, quote));
    await expect(new AccommodationsBookingQuoteClient(config, tokens).getQuote('p', 'r', 2, 'trace-1234')).resolves.toEqual(quote);
    expect(fetchMock).toHaveBeenCalledWith('http://accommodations/internal/v1/properties/p/rooms/r/booking-quote?guests=2', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer service-token', 'x-request-id': 'trace-1234' }) }));
  });

  it.each([[404, 'ACCOMMODATION_NOT_FOUND'], [409, 'ACCOMMODATION_CONFLICT'], [500, 'DEPENDENCY_UNAVAILABLE'], [400, 'DEPENDENCY_REJECTED']])('maps accommodations status %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(response(status));
    await expect(new AccommodationsBookingQuoteClient(config, tokens).getQuote('p', 'r', 2)).rejects.toMatchObject({ code });
  });

  it('fails closed on accommodations transport and invalid payloads', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(new AccommodationsBookingQuoteClient(config, tokens).getQuote('p', 'r', 2)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    fetchMock.mockResolvedValueOnce(response(200, { propertyStatus: 'DRAFT' }));
    await expect(new AccommodationsBookingQuoteClient(config, tokens).getQuote('p', 'r', 2)).rejects.toMatchObject({ code: 'DEPENDENCY_INVALID_RESPONSE' });
  });

  it('creates payment orders with a derived idempotency key', async () => {
    const bookingId = '11111111-1111-4111-8111-111111111111';
    const guestId = '22222222-2222-4222-8222-222222222222';
    const paymentId = '33333333-3333-4333-8333-333333333333';
    fetchMock.mockResolvedValue(response(201, { id: paymentId, bookingId, payerUserId: guestId, amountMinor: 1000, currency: 'USD', status: 'APPROVED' }));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId, guestId, amount: '10.00', currency: 'USD' }, 'key-123')).resolves.toEqual({ paymentId, status: 'APPROVED' });
    expect(tokens.getToken).toHaveBeenCalledWith('payments-service', 'payments:charge');
    expect(fetchMock).toHaveBeenCalledWith('http://payments/payments', expect.objectContaining({
      headers: expect.objectContaining({ 'idempotency-key': paymentsIdempotencyKey('key-123') }),
      body: JSON.stringify({ bookingId, payerUserId: guestId, amountMinor: 1000, currency: 'USD', paymentMethod: { type: 'CARD_TOKEN', token: 'booking_11111111111141118111111111111111' } }),
    }));
  });

  it.each([[503, 'DEPENDENCY_UNAVAILABLE'], [400, 'PAYMENT_REJECTED']])('maps payment order status %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(response(status));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId: '11111111-1111-4111-8111-111111111111', guestId: '22222222-2222-4222-8222-222222222222', amount: '10.00', currency: 'USD' }, 'key-123')).rejects.toMatchObject({ code });
  });

  it('rejects an invalid payment order response and transport failure', async () => {
    fetchMock.mockResolvedValueOnce(response(201, { status: 'PENDING' }));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId: '11111111-1111-4111-8111-111111111111', guestId: '22222222-2222-4222-8222-222222222222', amount: '10.00', currency: 'USD' }, 'key-123')).rejects.toMatchObject({ code: 'DEPENDENCY_INVALID_RESPONSE' });
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId: '11111111-1111-4111-8111-111111111111', guestId: '22222222-2222-4222-8222-222222222222', amount: '10.00', currency: 'USD' }, 'key-123')).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it('maps a refund request to the Payments provider contract', async () => {
    const paymentId = '33333333-3333-4333-8333-333333333333';
    const refundId = '44444444-4444-4444-8444-444444444444';
    fetchMock.mockResolvedValue(response(202, { id: refundId, paymentId, amountMinor: 500, status: 'PENDING' }));
    await expect(new PaymentsRefundsClient(config, tokens).requestRefund({ bookingId: '11111111-1111-4111-8111-111111111111', paymentOrderId: paymentId, amount: '5.00', mode: 'POLICY', policyVersion: 'v1' }, 'refund-key')).resolves.toEqual({ refundId, status: 'PENDING' });
    expect(tokens.getToken).toHaveBeenCalledWith('payments-service', 'payments:refund');
    expect(fetchMock).toHaveBeenCalledWith(`http://payments/payments/${paymentId}/refund`, expect.objectContaining({ body: JSON.stringify({ amountMinor: 500, reason: 'GUEST_CANCELLATION' }) }));
  });

  it.each([[503, 'DEPENDENCY_UNAVAILABLE'], [400, 'PAYMENT_REJECTED'], [200, 'DEPENDENCY_INVALID_RESPONSE']])('maps refund status %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(response(status));
    await expect(new PaymentsRefundsClient(config, tokens).requestRefund({ bookingId: '11111111-1111-4111-8111-111111111111', paymentOrderId: '33333333-3333-4333-8333-333333333333', amount: '10.00', mode: 'FULL' }, 'refund-key')).rejects.toMatchObject({ code });
  });

  it('maps a refund transport failure to an unavailable dependency', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(new PaymentsRefundsClient(config, tokens).requestRefund({ bookingId: '11111111-1111-4111-8111-111111111111', paymentOrderId: '33333333-3333-4333-8333-333333333333', amount: '10.00', mode: 'FULL' }, 'refund-key')).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
});
