import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

interface Operation {
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  requestBody?: { content?: Record<string, { schema?: { required?: string[]; properties?: Record<string, unknown> } }> };
  responses?: Record<string, unknown>;
}

interface Api {
  paths?: Record<string, { post?: Operation }>;
}

const consumerPath = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-payments-consumer.yaml');
const providerPath = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/payments_service/contracts/openapi-payments-service.yaml');

describe('Payments provider contract consumed by Bookings', () => {
  it('uses provider paths, operation identifiers, scopes and response statuses', async () => {
    const [consumer, provider] = await Promise.all([
      SwaggerParser.dereference(consumerPath) as Promise<unknown> as Promise<Api>,
      SwaggerParser.dereference(providerPath) as Promise<unknown> as Promise<Api>,
    ]);

    for (const path of ['/payments', '/payments/{id}/refund']) {
      const consumed = consumer.paths?.[path]?.post;
      const provided = provider.paths?.[path]?.post;
      expect(consumed?.operationId).toBe(provided?.operationId);
      expect(consumed?.security).toEqual(provided?.security);
      expect(Object.keys(consumed?.responses ?? {})).toEqual(expect.arrayContaining(Object.keys(provided?.responses ?? {})));
    }
  });

  it('sends every field required by the provider', async () => {
    const [consumer, provider] = await Promise.all([
      SwaggerParser.dereference(consumerPath) as Promise<unknown> as Promise<Api>,
      SwaggerParser.dereference(providerPath) as Promise<unknown> as Promise<Api>,
    ]);

    for (const path of ['/payments', '/payments/{id}/refund']) {
      const consumedSchema = consumer.paths?.[path]?.post?.requestBody?.content?.['application/json']?.schema;
      const providedSchema = provider.paths?.[path]?.post?.requestBody?.content?.['application/json']?.schema;
      expect(consumedSchema?.required).toEqual(expect.arrayContaining(providedSchema?.required ?? []));
      for (const field of providedSchema?.required ?? []) expect(consumedSchema?.properties).toHaveProperty(field);
    }
  });

  it('keeps both source contracts parseable without network access', () => {
    expect(readFileSync(consumerPath, 'utf8')).toContain('/payments/{id}/refund:');
    expect(readFileSync(providerPath, 'utf8')).toContain('/payments/{id}/refund:');
  });
});
