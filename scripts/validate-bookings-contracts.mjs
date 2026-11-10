import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const contracts = resolve('specs/003-reservas-pagos-resenas/booking_service/contracts');
const openapiPath = resolve(contracts, 'openapi-bookings-service.yaml');
const eventPath = resolve(contracts, 'booking-payment-events-v1.schema.json');

const expectedOperations = {
  '/bookings': { post: 'createBooking' },
  '/bookings/history': { get: 'getOwnerBookingHistory' },
  '/bookings/{bookingId}': { get: 'getBooking', delete: 'cancelBooking' },
  '/bookings/{bookingId}/check-in': { post: 'checkInBooking' },
  '/bookings/{bookingId}/check-out': { post: 'checkOutBooking' },
  '/internal/v1/bookings/{bookingId}/review-eligibility': { get: 'getReviewEligibility' },
};

const document = YAML.parse(readFileSync(openapiPath, 'utf8'));
assert.equal(document.openapi, '3.1.0', 'Bookings OpenAPI version must be 3.1.0');
await SwaggerParser.validate(structuredClone(document));
for (const [path, methods] of Object.entries(expectedOperations)) {
  assert.ok(document.paths?.[path], `Missing OpenAPI path ${path}`);
  for (const [method, operationId] of Object.entries(methods)) {
    assert.equal(document.paths[path]?.[method]?.operationId, operationId, `Missing operation ${method.toUpperCase()} ${path} (${operationId})`);
  }
}

const eventSchema = JSON.parse(readFileSync(eventPath, 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validateEvent = ajv.compile(eventSchema);
const completed = {
  eventId: '00000000-0000-4000-8000-000000000001',
  eventType: 'booking.v1.completed',
  schemaVersion: 1,
  occurredAt: '2035-06-03T12:00:00.000Z',
  bookingId: '00000000-0000-4000-8000-000000000002',
  guestId: '00000000-0000-4000-8000-000000000003',
  propertyId: '00000000-0000-4000-8000-000000000004',
};
assert.ok(validateEvent(completed), `booking.v1.completed fixture is invalid: ${JSON.stringify(validateEvent.errors)}`);
assert.ok(eventSchema.$defs?.bookingCancelled, 'Event schema is missing cancellation definition');
assert.ok(eventSchema.$defs?.bookingConfirmed, 'Event schema is missing confirmation definition');
assert.ok(!eventSchema.$defs?.refundCompleted, 'Payment refund events belong to the Payments producer schema');

console.log('Bookings contracts: OpenAPI valid, required operations present, event schema valid');
