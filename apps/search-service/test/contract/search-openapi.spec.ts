import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { SearchController } from '../../src/interfaces/http/search.controller';
import { SearchAccommodations } from '../../src/application/search/search-accommodations.use-case';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { ServiceJwtVerifier } from '../../src/infrastructure/security/service-jwt.verifier';
import { createSearchOpenApi } from '../../src/interfaces/openapi/openapi.factory';

type Json = Record<string, unknown>;
const source = parse(readFileSync('../../specs/002-alojamientos-busqueda/search_service/contracts/openapi-search-service.yaml', 'utf8')) as Json;
function resolve(value: unknown, document: Json): unknown {
  if (Array.isArray(value)) return value.map((item) => resolve(item, document));
  if (!value || typeof value !== 'object') return value;
  const object = value as Json;
  if (typeof object.$ref === 'string') {
    const target = object.$ref.slice(2).split('/').reduce<unknown>((node, key) => (node as Json)[key], document);
    return resolve(target, document);
  }
  return Object.fromEntries(Object.entries(object).filter(([key]) => !['description', 'example', 'title'].includes(key)).map(([key, item]) => [key, resolve(item, document)]));
}
function getOperation(document: Json): Json { return ((document.paths as Json)['/internal/v1/search'] as Json).get as Json; }
describe('Swagger search endpoint matches the source OpenAPI', () => {
  let app: INestApplication; let generated: Json;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [SearchController], providers: [
      { provide: SearchAccommodations, useValue: { execute: jest.fn() } }, { provide: ServiceJwtVerifier, useValue: { verify: jest.fn() } }, ServiceAuthGuard,
    ] }).compile();
    app = module.createNestApplication(); await app.init(); generated = createSearchOpenApi(app) as unknown as Json;
  });
  afterAll(async () => { await app.close(); });
  it('documents internal service authentication and the operation id', () => {
    expect(generated.openapi).toBe('3.1.0');
    expect(getOperation(generated).operationId).toEqual(getOperation(source).operationId);
    expect(getOperation(generated).security).toEqual(getOperation(source).security);
    expect((generated.components as Json).securitySchemes).toEqual((source.components as Json).securitySchemes);
  });
  it('documents every filter with the same constraints and defaults', () => {
    const expected = resolve(getOperation(source).parameters, source) as Json[];
    const actual = resolve(getOperation(generated).parameters, generated) as Json[];
    expect(actual.map((p) => p.name).sort()).toEqual(expected.map((p) => p.name).sort());
    for (const parameter of expected) {
      const match = actual.find((p) => p.name === parameter.name)!;
      expect(match.in).toEqual(parameter.in); expect(match.required ?? false).toEqual(parameter.required ?? false);
      expect(match.schema).toEqual(parameter.schema);
      if (parameter.name === 'amenities') { expect(match.style ?? 'form').toBe('form'); expect(match.explode ?? true).toBe(true); }
    }
  });
  it('documents response schemas and Problem Details for every search status', () => {
    const expected = resolve(getOperation(source).responses, source) as Json;
    const actual = resolve(getOperation(generated).responses, generated) as Json;
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const status of Object.keys(expected)) {
      expect((actual[status] as Json).content).toEqual((expected[status] as Json).content);
    }
  });
});
