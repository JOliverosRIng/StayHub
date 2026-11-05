import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ACCOMMODATIONS_CONFIG } from '../../src/infrastructure/config/accommodations-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { createOpenApi } from '../../src/interfaces/openapi/openapi.factory';
import { testConfig } from '../fixtures/config.fixture';
import { operations } from './openapi-contract';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'];

function documented(doc: { paths?: Record<string, Record<string, unknown>> }): { method: string; path: string; operationId: string; statuses: number[] }[] {
  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => item[method]).map((method) => {
      const operation = item[method] as { operationId?: string; responses?: Record<string, unknown> };
      return { method, path, operationId: operation.operationId ?? '', statuses: Object.keys(operation.responses ?? {}).map(Number).sort((a, b) => a - b) };
    }));
}

describe('ACC-034 generated Swagger vs frozen accommodations contract', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACCOMMODATIONS_CONFIG).useValue(testConfig())
      .overrideProvider(PrismaService).useValue({ ready: () => Promise.resolve(true) })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('exposes exactly the four contracted operations with matching paths, methods, operationIds and statuses', () => {
    const expected = operations().map(({ method, path, operation }) => ({
      method, path, operationId: operation.operationId, statuses: Object.keys(operation.responses).map(Number).sort((a, b) => a - b),
    })).sort((a, b) => a.operationId.localeCompare(b.operationId));
    const generated = documented(createOpenApi(app) as unknown as { paths?: Record<string, Record<string, unknown>> }).sort((a, b) => a.operationId.localeCompare(b.operationId));
    expect(generated).toEqual(expected);
  });

  it('does not document health or storage internals', () => {
    const generated = JSON.stringify(createOpenApi(app) as object);
    expect(generated).not.toMatch(/\/health|storageKey|photoStorageRoot|BEGIN RSA PRIVATE KEY/);
  });
});
