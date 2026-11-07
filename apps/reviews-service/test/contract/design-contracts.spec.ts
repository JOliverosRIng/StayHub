import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

interface ObjectSchema { type?: string; additionalProperties?: unknown; }
interface OpenApiDocument { openapi: string; components?: { schemas?: Record<string, ObjectSchema> }; }

describe('Reviews OpenAPI design contracts', () => {
  const directory = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/reviews_service/contracts');
  it.each(['openapi-reviews-service.yaml', 'openapi-bookings-review-eligibility-consumer.yaml'])('is valid OpenAPI 3.1: %s', async (file) => {
    const api = await SwaggerParser.validate(resolve(directory, file)) as unknown as OpenApiDocument; expect(api.openapi).toBe('3.1.0');
    const schemas = api.components?.schemas ?? {}; for (const schema of Object.values(schemas)) { if (typeof schema === 'object' && schema && 'type' in schema && schema.type === 'object') expect(schema.additionalProperties).toBe(false); }
  });
});
