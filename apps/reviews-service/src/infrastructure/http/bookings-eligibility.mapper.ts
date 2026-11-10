import type { ReviewEligibility } from '@reviews/application/ports/stay-eligibility.port';
import { DomainError } from '@reviews/domain/shared/domain-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FIELDS = new Set(['bookingId', 'guestId', 'propertyId', 'eligible']);

function fail(): never {
  throw new DomainError('DEPENDENCY_UNAVAILABLE');
}

export function mapReviewEligibility(
  value: unknown,
  expected: Readonly<{ bookingId: string; guestId: string }>,
): ReviewEligibility {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail();
  const row = value as Record<string, unknown>;

  if (Object.keys(row).some((key) => !FIELDS.has(key))) fail();

  const { bookingId, guestId, propertyId, eligible } = row;
  if (
    typeof bookingId !== 'string' ||
    !UUID.test(bookingId) ||
    typeof guestId !== 'string' ||
    !UUID.test(guestId) ||
    typeof propertyId !== 'string' ||
    !UUID.test(propertyId) ||
    typeof eligible !== 'boolean'
  ) {
    fail();
  }
  if (bookingId !== expected.bookingId || guestId !== expected.guestId) fail();

  return { bookingId, guestId, propertyId, eligible };
}
