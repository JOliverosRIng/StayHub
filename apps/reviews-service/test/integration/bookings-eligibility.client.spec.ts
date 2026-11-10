import type { ServiceTokenPort } from '@reviews/application/ports/service-token.port';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { BookingsReviewEligibilityClient } from '@reviews/infrastructure/http/bookings-review-eligibility.client';
import { DomainError } from '@reviews/domain/shared/domain-error';

const BOOKING = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const PROPERTY = '00000000-0000-4000-8000-000000000003';

function config(): ReviewsConfig {
  return {
    bookingsBaseUrl: 'http://bookings-service:3005',
    bookingsTimeoutMs: 1500,
  } as ReviewsConfig;
}

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

function eligibility(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { bookingId: BOOKING, guestId: GUEST, propertyId: PROPERTY, eligible: true, ...overrides };
}

describe('BookingsReviewEligibilityClient', () => {
  const tokens: ServiceTokenPort = { getToken: async () => 'service-token' };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let client: BookingsReviewEligibilityClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new BookingsReviewEligibilityClient(config(), tokens);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('accepts an exact 200 eligible response and propagates x-request-id', async () => {
    fetchMock.mockResolvedValue(response(200, eligibility()));

    await expect(client.getEligibility(BOOKING, GUEST, 'trace-0001')).resolves.toEqual({
      bookingId: BOOKING,
      guestId: GUEST,
      propertyId: PROPERTY,
      eligible: true,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `http://bookings-service:3005/internal/v1/bookings/${BOOKING}/review-eligibility?guestId=${GUEST}`,
    );
    expect(init.headers).toMatchObject({
      authorization: 'Bearer service-token',
      'x-request-id': 'trace-0001',
    });
  });

  it('maps provider 404 to booking not eligible without disclosure', async () => {
    fetchMock.mockResolvedValue(response(404, {}));

    await expect(client.getEligibility(BOOKING, GUEST, 'trace')).rejects.toMatchObject({
      code: 'BOOKING_NOT_ELIGIBLE',
    });
  });

  it.each([400, 401, 403, 500, 503])(
    'fails closed for provider status %s',
    async (status) => {
      fetchMock.mockResolvedValue(response(status, {}));

      await expect(client.getEligibility(BOOKING, GUEST, 'trace')).rejects.toMatchObject({
        code: 'DEPENDENCY_UNAVAILABLE',
      });
    },
  );

  it('fails closed on timeout or connection failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.getEligibility(BOOKING, GUEST, 'trace')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
  });

  it('fails closed on malformed JSON', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Response);

    await expect(client.getEligibility(BOOKING, GUEST, 'trace')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
  });

  it('fails closed on identifier mismatch or unexpected fields', async () => {
    fetchMock.mockResolvedValueOnce(response(200, eligibility({ guestId: '00000000-0000-4000-8000-000000000099' })));
    await expect(client.getEligibility(BOOKING, GUEST, 'trace')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });

    fetchMock.mockResolvedValueOnce(response(200, eligibility({ extra: true })));
    await expect(client.getEligibility(BOOKING, GUEST, 'trace')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
  });

  it('reports unavailable service credentials', async () => {
    const failingTokens: ServiceTokenPort = {
      getToken: async () => {
        throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
      },
    };
    const subject = new BookingsReviewEligibilityClient(config(), failingTokens);

    await expect(subject.getEligibility(BOOKING, GUEST, 'trace')).rejects.toMatchObject({
      code: 'SERVICE_CREDENTIALS_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
