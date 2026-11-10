import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { RefundsController } from '../../src/interfaces/http/refunds/refunds.controller';
import { RefundPayment } from '../../src/application/refunds/refund-payment.use-case';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { PAYMENTS_CONFIG } from '../../src/infrastructure/config/payments-config';
import { createPaymentsOpenApi } from '../../src/interfaces/openapi/openapi.factory';

type Json = Record<string, unknown>;
const source = parse(readFileSync('../../specs/003-reservas-pagos-resenas/payments_service/contracts/openapi-payments-service.yaml', 'utf8')) as Json;
const path = '/payments/{id}/refund';

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

describe('POST /payments/{id}/refund OpenAPI contract', () => {
  let app: INestApplication;
  let generated: Json;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RefundsController as unknown as Type<unknown>],
      providers: [
        { provide: RefundPayment, useValue: { execute: jest.fn() } },
        { provide: PAYMENTS_CONFIG, useValue: { serviceJwt: { issuer: 'issuer', audience: 'audience', kid: 'kid', publicKey: 'unused' }, refundScope: 'payments:refund' } },
        ServiceAuthGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    generated = createPaymentsOpenApi(app) as unknown as Json;
  });

  afterAll(async () => { await app.close(); });

  it('documents the refund operation, path/key/body parameters, service scope and all statuses', () => {
    const expected = ((source.paths as Json)[path] as Json).post as Json;
    const actual = (((generated.paths as Json)[path] as Json | undefined)?.post ?? {}) as Json;
    expect(actual.operationId).toBe(expected.operationId);
    expect(actual.security).toEqual(expected.security);
    expect(resolve(actual.parameters, generated)).toEqual(resolve(expected.parameters, source));
    expect(resolve(actual.requestBody, generated)).toEqual(resolve(expected.requestBody, source));
    expect(resolve(actual.responses, generated)).toEqual(resolve(expected.responses, source));
    expect(Object.keys(actual.responses as Json).sort()).toEqual(['201', '202', '400', '401', '403', '404', '409', '422', '503']);
  });
});
