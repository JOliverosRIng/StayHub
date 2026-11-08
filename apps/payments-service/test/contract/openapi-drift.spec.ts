import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { HealthController } from '../../src/modules/health/health.controller';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { createPaymentsOpenApi } from '../../src/interfaces/openapi/openapi.factory';

type JsonObject = Record<string, unknown>;
const source = parse(readFileSync('../../specs/003-reservas-pagos-resenas/payments_service/contracts/openapi-payments-service.yaml', 'utf8')) as JsonObject;

describe('Payments OpenAPI contract base', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { isReachable: jest.fn(), hasAppliedMigrations: jest.fn() } }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('keeps OpenAPI version, metadata, servers, auth schemes, base health paths and shared schemas aligned', () => {
    const generated = createPaymentsOpenApi(app) as unknown as JsonObject;
    expect(generated.openapi).toBe(source.openapi);
    expect(generated.info).toEqual(source.info);
    expect(generated.servers).toEqual(source.servers);

    const generatedComponents = generated.components as JsonObject;
    const sourceComponents = source.components as JsonObject;
    expect(generatedComponents.securitySchemes).toEqual(sourceComponents.securitySchemes);
    expect(generatedComponents.schemas).toEqual(sourceComponents.schemas);

    const generatedPaths = generated.paths as JsonObject;
    const sourcePaths = source.paths as JsonObject;
    for (const path of ['/health/live', '/health/ready']) {
      const generatedOperation = (generatedPaths[path] as JsonObject).get as JsonObject;
      const sourceOperation = (sourcePaths[path] as JsonObject).get as JsonObject;
      expect(generatedOperation.operationId).toBe(sourceOperation.operationId);
      expect(generatedOperation.security ?? []).toEqual(sourceOperation.security ?? []);
      expect(generatedOperation.responses).toEqual(sourceOperation.responses);
    }
  });
});
