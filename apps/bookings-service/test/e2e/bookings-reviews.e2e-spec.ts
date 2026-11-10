import { randomUUID } from 'node:crypto';

const bookingsUrl = process.env.BOOKINGS_REVIEWS_E2E_BOOKINGS_URL;
const reviewsUrl = process.env.BOOKINGS_REVIEWS_E2E_REVIEWS_URL;
const guestToken = process.env.BOOKINGS_REVIEWS_E2E_GUEST_TOKEN;
const ownerToken = process.env.BOOKINGS_REVIEWS_E2E_OWNER_TOKEN;
const enabled = Boolean(bookingsUrl && reviewsUrl && guestToken && ownerToken);
const describeReal = enabled ? describe : describe.skip;

interface HttpResponse {
  status: number;
  body: unknown;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(value: string, days: number): string {
  const time = Date.parse(`${value}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

async function http(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<HttpResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: response.status, body };
}

async function waitForBooking(bookingId: string, predicate: (body: Record<string, unknown>) => boolean, timeoutMs = 45_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await http(bookingsUrl!, `/bookings/${bookingId}`, { token: guestToken! });
    if (response.status === 200 && predicate(response.body as Record<string, unknown>)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Booking ${bookingId} did not reach the expected state`);
}

async function createBooking(checkIn: string, checkOut: string): Promise<string> {
  const response = await http(bookingsUrl!, '/bookings', {
    method: 'POST',
    token: guestToken!,
    headers: { 'Idempotency-Key': `reviews-e2e-${randomUUID()}` },
    body: { propertyId: randomUUID(), roomId: randomUUID(), checkIn, checkOut, guests: 1 },
  });
  if (response.status !== 201) throw new Error(`Booking creation failed with ${response.status}: ${JSON.stringify(response.body)}`);
  return String((response.body as { id: string }).id);
}

describeReal('real Bookings ↔ Reviews integration', () => {
  jest.setTimeout(90_000);

  it('creates one review through Reviews after a completed stay and rejects duplicates/non-completed stays', async () => {
    const checkIn = today();
    const checkOut = plusDays(checkIn, 2);
    const bookingId = await createBooking(checkIn, checkOut);
    await waitForBooking(bookingId, (booking) => booking.status === 'CONFIRMED');

    await expect(http(bookingsUrl!, `/bookings/${bookingId}/check-in`, { method: 'POST', token: ownerToken! })).resolves.toMatchObject({ status: 200 });
    await expect(http(bookingsUrl!, `/bookings/${bookingId}/check-out`, { method: 'POST', token: ownerToken! })).resolves.toMatchObject({ status: 200 });

    const created = await http(reviewsUrl!, '/internal/v1/reviews', {
      method: 'POST', token: guestToken!, body: { bookingId, rating: 5, comment: 'Excelente estadía' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ rating: 5, comment: 'Excelente estadía' });
    expect(created.body).not.toHaveProperty('bookingId');
    expect(created.body).not.toHaveProperty('guestId');

    const duplicate = await http(reviewsUrl!, '/internal/v1/reviews', {
      method: 'POST', token: guestToken!, body: { bookingId, rating: 4, comment: 'Otra' },
    });
    expect(duplicate.status).toBe(409);

    const pendingBookingId = await createBooking(plusDays(checkIn, 5), plusDays(checkIn, 7));
    const notEligible = await http(reviewsUrl!, '/internal/v1/reviews', {
      method: 'POST', token: guestToken!, body: { bookingId: pendingBookingId, rating: 5, comment: 'No completada' },
    });
    expect(notEligible.status).toBe(404);
  });
});
