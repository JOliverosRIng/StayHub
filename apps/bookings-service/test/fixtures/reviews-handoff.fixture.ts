export interface BookingCompletedEventFixture {
  eventId: string;
  eventType: 'booking.v1.completed';
  schemaVersion: 1;
  occurredAt: string;
  bookingId: string;
  guestId: string;
  propertyId: string;
}

export interface ReviewEligibilityFixture {
  bookingId: string;
  guestId: string;
  propertyId: string;
  eligible: boolean;
}

export const REVIEWS_HANDOFF_IDS = {
  eventId: '00000000-0000-4000-8000-000000000041',
  bookingId: '00000000-0000-4000-8000-000000000042',
  guestId: '00000000-0000-4000-8000-000000000043',
  propertyId: '00000000-0000-4000-8000-000000000044',
} as const;

export function bookingCompletedEvent(overrides: Partial<BookingCompletedEventFixture> = {}): BookingCompletedEventFixture {
  return {
    eventId: REVIEWS_HANDOFF_IDS.eventId,
    eventType: 'booking.v1.completed',
    schemaVersion: 1,
    occurredAt: '2035-06-03T12:00:00.000Z',
    bookingId: REVIEWS_HANDOFF_IDS.bookingId,
    guestId: REVIEWS_HANDOFF_IDS.guestId,
    propertyId: REVIEWS_HANDOFF_IDS.propertyId,
    ...overrides,
  };
}

export function reviewEligibilityResponse(overrides: Partial<ReviewEligibilityFixture> = {}): ReviewEligibilityFixture {
  return {
    bookingId: REVIEWS_HANDOFF_IDS.bookingId,
    guestId: REVIEWS_HANDOFF_IDS.guestId,
    propertyId: REVIEWS_HANDOFF_IDS.propertyId,
    eligible: true,
    ...overrides,
  };
}
