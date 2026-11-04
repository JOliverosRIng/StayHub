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

describe('suggest endpoint security', () => {
  let app: INestApplication;
  const execute = jest.fn().mockResolvedValue({ items: [] });
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
    execute.mockClear();
    verify.mockReset().mockResolvedValue({ scope: 'search:invoke' });
  });

  afterAll(async () => app.close());

  it('requires a verified service JWT and rejects insufficient scope', async () => {
    await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest?q=casa')
      .expect(401);
    verify.mockRejectedValueOnce(
      new SearchApplicationError('SEARCH_FORBIDDEN', 'Insufficient scope.', 403),
    );
    await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest?q=casa')
      .set('Authorization', 'Bearer invalid-scope')
      .expect(403);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects unknown fields and treats injection content as a value', async () => {
    await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest?q=casa&userId=private')
      .set('Authorization', 'Bearer test')
      .expect(400);
    const injection = "casa'); DROP TABLE search_documents;--";
    await request(app.getHttpServer() as Server)
      .get('/internal/v1/search/suggest')
      .query({ q: injection, limit: 10 })
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ q: injection.toLocaleLowerCase('es') }),
    );
  });
});
