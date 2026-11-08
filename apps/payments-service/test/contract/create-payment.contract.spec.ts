import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { PaymentsController } from '../../src/interfaces/http/payments/payments.controller';
import { CreatePayment } from '../../src/application/payments/create-payment.use-case';
import { createPaymentsOpenApi } from '../../src/interfaces/openapi/openapi.factory';

type Json = Record<string, unknown>;
const source = parse(readFileSync('../../specs/003-reservas-pagos-resenas/payments_service/contracts/openapi-payments-service.yaml', 'utf8')) as Json;

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

function getOperation(document: Json): Json {
  return ((document.paths as Json)['/payments'] as Json).post as Json;
}

describe('POST /payments OpenAPI contract', () => {
  let app: INestApplication;
  let generated: Json;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: CreatePayment, useValue: { execute: jest.fn() } }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    generated = createPaymentsOpenApi(app) as unknown as Json;
  });

  afterAll(async () => { await app.close(); });

  it('documents the payment operation and service authentication', () => {
    expect(generated.openapi).toBe('3.1.0');
    expect(getOperation(generated).operationId).toEqual(getOperation(source).operationId);
    expect(getOperation(generated).security).toEqual(getOperation(source).security);
  });

  it('accepts the required body and idempotency header defined by the source contract', () => {
    const expected = resolve(getOperation(source).parameters, source) as Json[];
    const actual = resolve(getOperation(generated).parameters, generated) as Json[];
    expect(actual).toEqual(expected);

    const expectedBody = resolve(getOperation(source).requestBody, source) as Json;
    const actualBody = resolve(getOperation(generated).requestBody, generated) as Json;
    expect(actualBody).toEqual(expectedBody);
  });

  it('documents the required 201, 202, 400, 401, 403, 409 and 503 response contracts', () => {
    const expected = resolve(getOperation(source).responses, source) as Json;
    const actual = resolve(getOperation(generated).responses, generated) as Json;
    const requiredStatuses = ['201', '202', '400', '401', '403', '409', '503'];
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    expect(Object.keys(actual).sort()).toEqual(requiredStatuses);
    for (const status of requiredStatuses) {
      expect((actual[status] as Json).content).toEqual((expected[status] as Json).content);
    }
  });
});
