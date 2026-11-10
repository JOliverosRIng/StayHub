import { AccommodationsBookingQuoteClient } from '@bookings/infrastructure/http/accommodations-booking-quote.client';
import { PaymentsOrdersClient } from '@bookings/infrastructure/http/payments-orders.client';
import { PaymentsRefundsClient } from '@bookings/infrastructure/http/payments-refunds.client';

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
    fetchMock.mockResolvedValue(response(201, { paymentOrderId: 'order-1', status: 'PENDING' }));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId: 'b', guestId: 'g', amount: '10.00', currency: 'USD' }, 'key-123')).resolves.toEqual({ paymentOrderId: 'order-1', status: 'PENDING' });
    expect(fetchMock).toHaveBeenCalledWith('http://payments/internal/v1/payment-orders', expect.objectContaining({ headers: expect.objectContaining({ 'idempotency-key': 'key-123' }) }));
  });

  it.each([[503, 'DEPENDENCY_UNAVAILABLE'], [400, 'PAYMENT_REJECTED']])('maps payment order status %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(response(status));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId: 'b', guestId: 'g', amount: '10.00', currency: 'USD' }, 'key-123')).rejects.toMatchObject({ code });
  });

  it('rejects an invalid payment order response and transport failure', async () => {
    fetchMock.mockResolvedValueOnce(response(201, { status: 'PENDING' }));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId: 'b', guestId: 'g', amount: '10.00', currency: 'USD' }, 'key-123')).rejects.toMatchObject({ code: 'DEPENDENCY_INVALID_RESPONSE' });
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(new PaymentsOrdersClient(config, tokens).createOrder({ bookingId: 'b', guestId: 'g', amount: '10.00', currency: 'USD' }, 'key-123')).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it('accepts a refund request only with 202', async () => {
    fetchMock.mockResolvedValue(response(202));
    await expect(new PaymentsRefundsClient(config, tokens).requestRefund({ bookingId: 'b', paymentOrderId: 'o', mode: 'POLICY', policyVersion: 'v1' }, 'refund-key')).resolves.toEqual({ status: 'ACCEPTED' });
    expect(fetchMock).toHaveBeenCalledWith('http://payments/internal/v1/refunds', expect.objectContaining({ body: JSON.stringify({ bookingId: 'b', paymentOrderId: 'o', mode: 'POLICY', policyVersion: 'v1' }) }));
  });

  it.each([[503, 'DEPENDENCY_UNAVAILABLE'], [400, 'PAYMENT_REJECTED'], [200, 'DEPENDENCY_INVALID_RESPONSE']])('maps refund status %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(response(status));
    await expect(new PaymentsRefundsClient(config, tokens).requestRefund({ bookingId: 'b', paymentOrderId: 'o', mode: 'FULL' }, 'refund-key')).rejects.toMatchObject({ code });
  });

  it('maps a refund transport failure to an unavailable dependency', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(new PaymentsRefundsClient(config, tokens).requestRefund({ bookingId: 'b', paymentOrderId: 'o', mode: 'FULL' }, 'refund-key')).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
});
