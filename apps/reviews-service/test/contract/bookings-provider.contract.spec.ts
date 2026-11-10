import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

interface EligibilitySchema {
  type?: string;
  required?: string[];
}

interface ProviderApi {
  paths?: Record<
    string,
    {
      get?: {
        operationId?: string;
        parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
        responses?: Record<
          string,
          { content?: Record<string, { schema?: EligibilitySchema }> }
        >;
      };
    }
  >;
  components?: {
    securitySchemes?: Record<string, { type?: string; scheme?: string }>;
  };
}

const providerPath = resolve(
  __dirname,
  '../../../../specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-bookings-service.yaml',
);
const handoffPath = resolve(
  __dirname,
  '../../../../apps/bookings-service/test/fixtures/REVIEWS-HANDOFF.md',
);

describe('Bookings provider compatibility for Reviews', () => {
  it('exposes the frozen review eligibility operation', async () => {
    const api = (await SwaggerParser.dereference(providerPath)) as unknown as ProviderApi;
    const operation = api.paths?.['/internal/v1/bookings/{bookingId}/review-eligibility']?.get;

    expect(operation?.operationId).toBe('getReviewEligibility');
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'bookingId', in: 'path', required: true }),
        expect.objectContaining({ name: 'guestId', in: 'query', required: true }),
      ]),
    );
    expect(api.components?.securitySchemes?.serviceJwt).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('keeps the eligibility response with the handoff fields', async () => {
    const api = (await SwaggerParser.dereference(providerPath)) as unknown as ProviderApi;
    const schema =
      api.paths?.['/internal/v1/bookings/{bookingId}/review-eligibility']?.get?.responses?.['200']
        ?.content?.['application/json']?.schema;

    expect(schema?.type).toBe('object');
    expect([...(schema?.required ?? [])].sort()).toEqual([
      'bookingId',
      'eligible',
      'guestId',
      'propertyId',
    ]);
  });

  it('documents the service token audience and scope in the handoff', () => {
    const handoff = readFileSync(handoffPath, 'utf8');
    expect(handoff).toContain('reviews:eligibility');
    expect(handoff).toContain('BOOKINGS_REVIEWS_JWT_AUDIENCE');
    for (const field of ['bookingId', 'guestId', 'propertyId', 'eligible']) {
      expect(handoff).toContain(field);
    }
  });
});
