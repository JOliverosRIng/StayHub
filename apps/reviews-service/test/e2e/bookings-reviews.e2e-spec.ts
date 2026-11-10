import { readFileSync } from 'node:fs';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { BookingsReviewEligibilityClient } from '@reviews/infrastructure/http/bookings-review-eligibility.client';

function serviceToken(): string {
  const tokenFile = process.env.REVIEWS_BOOKINGS_E2E_TOKEN_FILE?.trim();
  return tokenFile ? readFileSync(tokenFile, 'utf8').trim() : (process.env.REVIEWS_BOOKINGS_E2E_TOKEN ?? '');
}

const settings = {
  baseUrl: process.env.REVIEWS_BOOKINGS_E2E_BASE_URL ?? '',
  token: serviceToken(),
  bookingId: process.env.REVIEWS_BOOKINGS_E2E_BOOKING_ID ?? '',
  guestId: process.env.REVIEWS_BOOKINGS_E2E_GUEST_ID ?? '',
};
const enabled = Object.values(settings).every((value) => value.length > 0);
const describeReal = enabled ? describe : describe.skip;

describeReal('real Bookings eligibility provider', () => {
  it('resolves eligibility through the real REST provider without sharing databases', async () => {
    const client = new BookingsReviewEligibilityClient(
      { bookingsBaseUrl: settings.baseUrl, bookingsTimeoutMs: 3000 } as ReviewsConfig,
      { getToken: async () => settings.token },
    );

    const result = await client.getEligibility(settings.bookingId, settings.guestId, 'reviews-e2e');

    expect(result).toMatchObject({
      bookingId: settings.bookingId,
      guestId: settings.guestId,
      eligible: true,
    });
    expect(result.propertyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });
});
