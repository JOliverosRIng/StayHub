import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';

const contracts = resolve('specs/003-reservas-pagos-resenas/reviews_service/contracts');
const servicePath = resolve(contracts, 'openapi-reviews-service.yaml');
const consumerPath = resolve(contracts, 'openapi-bookings-review-eligibility-consumer.yaml');

const expectedOperations = {
  '/internal/v1/reviews': { post: 'createReview' },
  '/internal/v1/properties/{propertyId}/reviews': { get: 'listPropertyReviews' },
  '/internal/v1/reviews/user/{userId}': { get: 'listOwnReviews' },
};

const service = YAML.parse(readFileSync(servicePath, 'utf8'));
assert.equal(service.openapi, '3.1.0', 'Reviews OpenAPI version must be 3.1.0');
await SwaggerParser.validate(structuredClone(service));
for (const [path, methods] of Object.entries(expectedOperations)) {
  assert.ok(service.paths?.[path], `Missing OpenAPI path ${path}`);
  for (const [method, operationId] of Object.entries(methods)) {
    assert.equal(
      service.paths[path]?.[method]?.operationId,
      operationId,
      `Missing operation ${method.toUpperCase()} ${path} (${operationId})`,
    );
  }
}

for (const name of ['CreateReview', 'Review', 'ReviewPage', 'Problem']) {
  const schema = service.components?.schemas?.[name];
  assert.ok(schema, `Missing schema ${name}`);
  assert.equal(schema.type, 'object', `Schema ${name} must be an object`);
  assert.equal(schema.additionalProperties, false, `Schema ${name} must be closed`);
}

assert.deepEqual(
  [...(service.components.schemas.CreateReview.required ?? [])].sort(),
  ['bookingId', 'comment', 'rating'],
  'CreateReview required fields drifted',
);
assert.deepEqual(
  [...(service.components.schemas.Review.required ?? [])].sort(),
  ['comment', 'createdAt', 'id', 'propertyId', 'rating'],
  'Review required fields drifted',
);
assert.deepEqual(
  [...(service.components.schemas.ReviewPage.required ?? [])].sort(),
  ['items', 'page', 'pageSize', 'total', 'totalPages'],
  'ReviewPage required fields drifted',
);

const consumer = YAML.parse(readFileSync(consumerPath, 'utf8'));
assert.equal(consumer.openapi, '3.1.0', 'Consumer OpenAPI version must be 3.1.0');
await SwaggerParser.validate(structuredClone(consumer));
const eligibility = consumer.paths?.['/internal/v1/bookings/{bookingId}/review-eligibility']?.get;
assert.equal(eligibility?.operationId, 'getReviewEligibility', 'Consumer operation drifted');
assert.ok(
  eligibility?.parameters?.some(
    (parameter) => parameter.name === 'guestId' && parameter.in === 'query' && parameter.required === true,
  ),
  'Consumer must require the guestId query parameter',
);
const eligibilitySchema = consumer.components?.schemas?.ReviewEligibility;
assert.equal(eligibilitySchema?.additionalProperties, false, 'ReviewEligibility must be closed');
assert.deepEqual(
  [...(eligibilitySchema?.required ?? [])].sort(),
  ['bookingId', 'eligible', 'guestId', 'propertyId'],
  'ReviewEligibility required fields drifted',
);

console.log('Reviews contracts: OpenAPI valid, required operations and closed schemas present');
