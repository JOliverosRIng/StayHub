import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { bookingCompletedEvent, reviewEligibilityResponse } from '../fixtures/reviews-handoff.fixture';

const contractDir = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/booking_service/contracts');
const eventSchema = JSON.parse(readFileSync(resolve(contractDir, 'booking-payment-events-v1.schema.json'), 'utf8')) as object;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validateEvent = ajv.compile(eventSchema);

interface DereferencedApi {
  paths?: Record<string, { get?: { operationId?: string; parameters?: Array<{ name?: string; in?: string; required?: boolean }> } }>;
}

describe('Bookings → Reviews provider contract', () => {
  it('freezes booking.v1.completed with only the minimal authoritative facts', () => {
    const event = bookingCompletedEvent();
    expect(validateEvent(event)).toBe(true);
    expect(Object.keys(event).sort()).toEqual(['bookingId', 'eventId', 'eventType', 'guestId', 'occurredAt', 'propertyId', 'schemaVersion']);
  });

  it('freezes the internal review eligibility response shape', () => {
    const response = reviewEligibilityResponse();
    expect(Object.keys(response).sort()).toEqual(['bookingId', 'eligible', 'guestId', 'propertyId']);
    expect(response.eligible).toBe(true);
  });

  it('exposes the review eligibility operation with a required guestId query', async () => {
    const api = await SwaggerParser.dereference(resolve(contractDir, 'openapi-bookings-service.yaml')) as unknown as DereferencedApi;
    const operation = api.paths?.['/internal/v1/bookings/{bookingId}/review-eligibility']?.get;
    expect(operation?.operationId).toBe('getReviewEligibility');
    expect(operation?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'guestId', in: 'query', required: true })]));
  });
});
