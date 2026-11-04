import SwaggerParser from '@apidevtools/swagger-parser';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { SearchApplicationError } from '../../src/application/errors/search-errors';
import { SuggestSearchTerms } from '../../src/application/suggestions/suggest-search-terms.use-case';
import { ServiceJwtVerifier } from '../../src/infrastructure/security/service-jwt.verifier';
import { SuggestController } from '../../src/interfaces/http/suggest.controller';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { ProblemFilter } from '../../src/interfaces/http/problem.filter';
import { createSearchValidationPipe } from '../../src/interfaces/http/validation.pipe';
import { createSearchOpenApi } from '../../src/interfaces/openapi/openapi.factory';

type Json = Record<string, unknown>;

describe('suggest HTTP contract', () => {
  let app: INestApplication;
  const execute = jest.fn();
  const verify = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SuggestController],
      providers: [
        { provide: SuggestSearchTerms, useValue: { execute } },
        { provide: ServiceJwtVerifier, useValue: { verify } },
        ServiceAuthGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createSearchValidationPipe());
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });

  beforeEach(() => {
    execute.mockReset().mockResolvedValue({
      items: [{ text: 'Bogotá', type: 'LOCATION' }],
    });
    verify.mockReset().mockResolvedValue({ scope: 'search:invoke' });
  });

  afterAll(async () => app.close());

  it('keeps the suggest source OpenAPI valid and constrained to q 1-120', async () => {
    const api: unknown = await SwaggerParser.validate(
      '../../specs/002-alojamientos-busqueda/search_service/contracts/openapi-search-service.yaml',
    );
    const serialized = JSON.stringify(api);
    expect(serialized).toContain('"/internal/v1/search/suggest"');
    expect(serialized).toContain('"operationId":"suggestSearchTerms"');
    expect(serialized).toContain(
      '"name":"q","in":"query","required":true,"schema":{"type":"string","minLength":1,"maxLength":120}',
    );
    expect(serialized).toContain(
      '"name":"limit","in":"query","schema":{"type":"integer","minimum":1,"maximum":20,"default":10}',
    );
  });

  it('generates Swagger for suggest with the same query limits and response shape', () => {
    const generated = createSearchOpenApi(app) as unknown as Json;
    const paths = generated.paths as Json;
    const path = paths['/internal/v1/search/suggest'] as Json;
    const operation = path.get as Json;
    const parameters = operation.parameters as Json[];
    const q = parameters.find((parameter) => parameter.name === 'q');
    const limit = parameters.find((parameter) => parameter.name === 'limit');
    expect(operation.operationId).toBe('suggestSearchTerms');
    expect(q?.required).toBe(true);
    expect(q?.schema).toEqual(
      expect.objectContaining({ minLength: 1, maxLength: 120 }),
    );
    expect(limit?.schema).toEqual(
      expect.objectContaining({ minimum: 1, maximum: 20, default: 10 }),
    );
    const responses = operation.responses as Json;
    const success = responses['200'] as Json;
    const content = success.content as Json;
    expect(content['application/json']).toBeDefined();
  });

  it('returns only public suggestion fields', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest?q=bogta&limit=10')
      .set('Authorization', 'Bearer test')
      .expect(200);
    const body: unknown = response.body;
    expect(body).toEqual({
      items: [{ text: 'Bogotá', type: 'LOCATION' }],
    });
    expect(JSON.stringify(body)).not.toContain('score');
  });

  it.each([
    '/internal/v1/search/suggest',
    '/internal/v1/search/suggest?q=',
    '/internal/v1/search/suggest?q=casa&limit=0',
    '/internal/v1/search/suggest?q=casa&limit=21',
    `/internal/v1/search/suggest?q=${'x'.repeat(121)}`,
  ])('returns 400 for invalid query %s', async (path) => {
    await request(app.getHttpServer() as Server)
      .get(path)
      .set('Authorization', 'Bearer test')
      .expect(400);
  });

  it('returns 401, 403 and 503 using Problem Details', async () => {
    await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest?q=casa')
      .expect(401);
    verify.mockRejectedValueOnce(
      new SearchApplicationError('SEARCH_FORBIDDEN', 'Insufficient scope.', 403),
    );
    await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest?q=casa')
      .set('Authorization', 'Bearer test')
      .expect(403);
    execute.mockRejectedValueOnce(
      new SearchApplicationError(
        'SEARCH_DEPENDENCY_UNAVAILABLE',
        'Database unavailable.',
        503,
      ),
    );
    await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest?q=casa')
      .set('Authorization', 'Bearer test')
      .expect(503);
  });
});
