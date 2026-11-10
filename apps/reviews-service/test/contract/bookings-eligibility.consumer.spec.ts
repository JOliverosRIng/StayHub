import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

interface Operation { operationId?: string; parameters?: Array<{ name?: string; in?: string; required?: boolean }>; responses?: Record<string, unknown>; }
interface Api { paths?: Record<string, { get?: Operation }>; }

describe('Bookings eligibility consumer compatibility', () => {
  const reviewsContracts = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/reviews_service/contracts');
  const bookingsContracts = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/booking_service/contracts');
  it('matches the frozen provider route and required guestId query', async () => {
    const consumer = await SwaggerParser.dereference(resolve(reviewsContracts, 'openapi-bookings-review-eligibility-consumer.yaml')) as unknown as Api;
    const provider = await SwaggerParser.dereference(resolve(bookingsContracts, 'openapi-bookings-service.yaml')) as unknown as Api;
    const path = '/internal/v1/bookings/{bookingId}/review-eligibility';
    expect(consumer.paths?.[path]?.get?.operationId).toBe('getReviewEligibility'); expect(provider.paths?.[path]?.get?.operationId).toBe('getReviewEligibility');
    expect(provider.paths?.[path]?.get?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'guestId', in: 'query', required: true })]));
  });
  it('uses the provider handoff fields and security scope', () => {
    const handoff = readFileSync(resolve(__dirname, '../../../../apps/bookings-service/test/fixtures/REVIEWS-HANDOFF.md'), 'utf8');
    for (const field of ['bookingId', 'guestId', 'propertyId', 'eligible']) expect(handoff).toContain(field);
    expect(handoff).toContain('reviews:eligibility'); expect(handoff).toContain('BOOKINGS_REVIEWS_JWT_AUDIENCE');
  });
});
