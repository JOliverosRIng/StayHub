import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { SearchController } from '../../src/interfaces/http/search.controller';
import { SuggestController } from '../../src/interfaces/http/suggest.controller';
import { HealthController } from '../../src/modules/health/health.controller';
import { SearchAccommodations } from '../../src/application/search/search-accommodations.use-case';
import { SuggestSearchTerms } from '../../src/application/suggestions/suggest-search-terms.use-case';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { ServiceJwtVerifier } from '../../src/infrastructure/security/service-jwt.verifier';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { SEARCH_CACHE_PORT } from '../../src/application/ports/search-cache.port';
import { RabbitMqHealth } from '../../src/infrastructure/health/rabbitmq-health';
import { ShutdownState } from '../../src/infrastructure/lifecycle/shutdown-state';
import { SEARCH_CONFIG } from '../../src/infrastructure/config/config.module';
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
  return Object.fromEntries(Object.entries(object)
    .filter(([key]) => !['example', 'title'].includes(key))
    .filter(([key, item]) => !(key === 'required' && item === false))
    .map(([key, item]) => [key, resolve(item, document)]));
}

function contractSurface(document: Json): Json {
  const paths = document.paths as Json;
  return Object.fromEntries(Object.entries(paths).map(([path, item]) => {
    const operation = (item as Json).get as Json;
    return [path, {
      operationId: operation.operationId,
      ...(operation.summary ? { summary: operation.summary } : {}),
      security: operation.security,
      parameters: resolve(operation.parameters ?? [], document),
      responses: resolve(operation.responses, document),
    }];
  }));
}

describe('generated OpenAPI drift', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SearchController, SuggestController, HealthController],
      providers: [
        { provide: SearchAccommodations, useValue: { execute: jest.fn() } },
        { provide: SuggestSearchTerms, useValue: { execute: jest.fn() } },
        { provide: ServiceJwtVerifier, useValue: { verify: jest.fn() } },
        { provide: PrismaService, useValue: { isHealthy: jest.fn() } },
        { provide: SEARCH_CACHE_PORT, useValue: { health: jest.fn() } },
        { provide: RabbitMqHealth, useValue: { health: jest.fn() } },
        { provide: ShutdownState, useValue: { isStopping: false } },
        { provide: SEARCH_CONFIG, useValue: { dependencyTimeoutMs: 50 } },
        ServiceAuthGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('keeps metadata, security and every documented operation synchronized', () => {
    const generated = createSearchOpenApi(app) as unknown as Json;
    expect(generated.openapi).toBe(source.openapi);
    expect({
      title: (generated.info as Json).title,
      version: (generated.info as Json).version,
      description: (generated.info as Json).description,
    }).toEqual(source.info);
    expect(generated.servers).toEqual(source.servers);
    expect((generated.components as Json).securitySchemes).toEqual((source.components as Json).securitySchemes);
    expect(Object.keys(generated.paths as Json).sort()).toEqual(Object.keys(source.paths as Json).sort());
    expect(contractSurface(generated)).toEqual(contractSurface(source));
  });
});
