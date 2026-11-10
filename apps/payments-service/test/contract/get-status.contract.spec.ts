import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { PaymentsController } from '../../src/interfaces/http/payments/payments.controller';
import { CreatePayment } from '../../src/application/payments/create-payment.use-case';
import { GetPaymentStatus } from '../../src/application/payments/get-payment-status.use-case';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { PaymentReadAuthGuard } from '../../src/interfaces/http/guards/payment-read-auth.guard';
import { PAYMENTS_CONFIG } from '../../src/infrastructure/config/payments-config';
import { createPaymentsOpenApi } from '../../src/interfaces/openapi/openapi.factory';

type Json = Record<string, unknown>;
const source = parse(readFileSync('../../specs/003-reservas-pagos-resenas/payments_service/contracts/openapi-payments-service.yaml', 'utf8')) as Json;
const path = '/payments/{id}/status';

function resolve(value: unknown, document: Json): unknown {
  if (Array.isArray(value)) return value.map((item) => resolve(item, document));
  if (!value || typeof value !== 'object') return value;
  const object = value as Json;
  if (typeof object.$ref === 'string') {
    const target = object.$ref.slice(2).split('/').reduce<unknown>((node, key) => (node as Json)[key], document);
    return resolve(target, document);
  }
  return Object.fromEntries(Object.entries(object)
    .filter(([key]) => !['description', 'example', 'title'].includes(key))
    .map(([key, item]) => [key, resolve(item, document)]));
}

describe('GET /payments/{id}/status OpenAPI contract', () => {
  let app: INestApplication;
  let generated: Json;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController as unknown as Type<unknown>],
      providers: [
        { provide: CreatePayment, useValue: { execute: jest.fn() } },
        { provide: GetPaymentStatus, useValue: { execute: jest.fn() } },
        { provide: PAYMENTS_CONFIG, useValue: {
          serviceJwt: { issuer: 'issuer', audience: 'audience', kid: 'kid', publicKey: 'unused' },
          userJwt: { issuer: 'issuer', audience: 'audience', kid: 'kid', publicKey: 'unused' },
          chargeScope: 'payments:charge', readScope: 'payments:read',
        } },
        ServiceAuthGuard,
        PaymentReadAuthGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    generated = createPaymentsOpenApi(app) as unknown as Json;
  });

  afterAll(async () => { await app.close(); });

  it('documents the operation, dual authentication, response schema and no-store header', () => {
    const expected = ((source.paths as Json)[path] as Json).get as Json;
    const actual = (((generated.paths as Json)[path] as Json | undefined)?.get ?? {}) as Json;
    expect(actual.operationId).toEqual(expected.operationId);
    expect((actual.security as Json[]).map((entry) => JSON.stringify(entry)).sort())
      .toEqual((expected.security as Json[]).map((entry) => JSON.stringify(entry)).sort());
    expect(resolve(actual.parameters, generated)).toEqual(resolve(expected.parameters, source));
    const expectedResponses = resolve(expected.responses, source) as Json;
    const actualResponses = resolve(actual.responses, generated) as Json;
    const expected200 = expectedResponses['200'] as Json;
    const actual200 = actualResponses['200'] as Json;
    delete expected200.headers;
    delete actual200.headers;
    expect(actualResponses).toEqual(expectedResponses);
    const response200 = resolve((actual.responses as Json)['200'], generated) as Json;
    const cacheControl = ((response200.headers as Json)['Cache-Control'] as Json).schema as Json;
    expect(cacheControl.type).toBe('string');
    expect(cacheControl.const ?? (cacheControl.enum as unknown[] | undefined)?.[0]).toBe('no-store');
  });

  it('does not expose gateway references, card tokens or payment fingerprints in PaymentStatus', () => {
    const status = resolve(((source.components as Json).schemas as Json).PaymentStatus, source) as Json;
    const properties = status.properties as Json;
    expect(Object.keys(properties).sort()).toEqual([
      'paymentId', 'bookingId', 'status', 'amountMinor', 'currency', 'refundedAmountMinor', 'failureCode', 'updatedAt',
    ].sort());
    expect(JSON.stringify(status)).not.toMatch(/gatewayReference|cardToken|paymentMethodFingerprint|tokenFingerprint/i);
  });
});
