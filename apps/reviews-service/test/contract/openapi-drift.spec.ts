import { resolve } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import SwaggerParser from '@apidevtools/swagger-parser';
import { CreateReviewUseCase } from '@reviews/application/create-review/create-review.use-case';
import { ListPropertyReviewsUseCase } from '@reviews/application/list-property-reviews/list-property-reviews.use-case';
import { ListOwnReviewsUseCase } from '@reviews/application/list-user-reviews/list-own-reviews.use-case';
import { Review } from '@reviews/domain/reviews/review';
import { buildReviewPage } from '@reviews/domain/reviews/review-page';
import { ServiceJwtVerifier } from '@reviews/infrastructure/security/service-jwt.verifier';
import { UserJwtVerifier } from '@reviews/infrastructure/security/user-jwt.verifier';
import { ServiceAuthGuard } from '@reviews/interfaces/http/guards/service-auth.guard';
import { UserAuthGuard } from '@reviews/interfaces/http/guards/user-auth.guard';
import { PropertyReviewsController } from '@reviews/interfaces/http/reviews/property-reviews.controller';
import { presentReview, presentReviewPage } from '@reviews/interfaces/http/reviews/review.presenter';
import { ReviewsController } from '@reviews/interfaces/http/reviews/reviews.controller';
import { UserReviewsController } from '@reviews/interfaces/http/reviews/user-reviews.controller';
import { buildReviewsOpenApiConfig } from '@reviews/interfaces/openapi/reviews.openapi';

interface DereferencedApi {
  paths?: Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, object> };
}

interface GeneratedOperation {
  responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
  requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> };
  security?: Array<Record<string, string[]>>;
}

function generatedOperation(
  app: INestApplication,
  path: string,
  method: 'get' | 'post',
): GeneratedOperation {
  const document = SwaggerModule.createDocument(app, buildReviewsOpenApiConfig());
  return document.paths?.[path]?.[method] as unknown as GeneratedOperation;
}

const contractPath = resolve(
  __dirname,
  '../../../../specs/003-reservas-pagos-resenas/reviews_service/contracts/openapi-reviews-service.yaml',
);

const REVIEW_ID = '00000000-0000-4000-8000-000000000001';
const BOOKING = '00000000-0000-4000-8000-000000000002';
const PROPERTY = '00000000-0000-4000-8000-000000000003';
const GUEST = '00000000-0000-4000-8000-000000000004';

describe('reviews OpenAPI drift', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReviewsController, PropertyReviewsController, UserReviewsController],
      providers: [
        { provide: CreateReviewUseCase, useValue: { execute: jest.fn() } },
        { provide: ListPropertyReviewsUseCase, useValue: { execute: jest.fn() } },
        { provide: ListOwnReviewsUseCase, useValue: { execute: jest.fn() } },
        { provide: UserJwtVerifier, useValue: { verify: jest.fn() } },
        { provide: ServiceJwtVerifier, useValue: { verify: jest.fn() } },
        UserAuthGuard,
        ServiceAuthGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the create operation aligned with the source contract', async () => {
    const api = (await SwaggerParser.dereference(contractPath)) as unknown as DereferencedApi;
    const operation = api.paths?.['/internal/v1/reviews']?.post;
    expect(operation?.operationId).toBe('createReview');
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '404', '409', '503']),
    );
    const createSchema = api.components?.schemas?.CreateReview as
      | { additionalProperties?: unknown; required?: string[] }
      | undefined;
    expect(createSchema?.additionalProperties).toBe(false);
    expect(createSchema?.required).toEqual(expect.arrayContaining(['bookingId', 'rating', 'comment']));
  });

  it('exposes the implemented create route in generated Swagger', () => {
    const operation = generatedOperation(app, '/internal/v1/reviews', 'post');
    expect(operation).toBeDefined();
    expect(Object.keys(operation.responses ?? {}).sort()).toEqual(
      ['201', '400', '401', '403', '404', '409', '503'].sort(),
    );
    expect(operation.security).toContainEqual({ userBearer: [] });
    expect(operation.requestBody?.content?.['application/json']?.schema).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['bookingId', 'rating', 'comment']),
    });
    expect(operation.responses?.['201']?.content?.['application/json']?.schema).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['id', 'propertyId', 'rating', 'comment', 'createdAt']),
    });
    expect(
      operation.responses?.['400']?.content?.['application/problem+json']?.schema,
    ).toMatchObject({ additionalProperties: false, required: expect.arrayContaining(['errors']) });
  });

  it('validates the presenter response against the Review schema', async () => {
    const api = (await SwaggerParser.dereference(contractPath)) as unknown as DereferencedApi;
    const schema = api.components?.schemas?.Review;
    expect(schema).toBeDefined();

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema as object);
    const review = Review.create({
      id: REVIEW_ID,
      bookingId: BOOKING,
      propertyId: PROPERTY,
      guestId: GUEST,
      rating: 5,
      comment: 'Excelente',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(validate(presentReview(review))).toBe(true);
  });

  it('keeps the property listing operation aligned with the source contract', async () => {
    const api = (await SwaggerParser.dereference(contractPath)) as unknown as DereferencedApi;
    const operation = api.paths?.['/internal/v1/properties/{propertyId}/reviews']?.get;
    expect(operation?.operationId).toBe('listPropertyReviews');
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
  });

  it('exposes the implemented property listing route in generated Swagger', () => {
    const operation = generatedOperation(
      app,
      '/internal/v1/properties/{propertyId}/reviews',
      'get',
    );
    expect(operation).toBeDefined();
    expect(Object.keys(operation.responses ?? {}).sort()).toEqual(['200', '400', '401', '403']);
    expect(operation.security).toContainEqual({ serviceJwt: [] });
    expect(operation.responses?.['200']?.content?.['application/json']?.schema).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['items', 'page', 'pageSize', 'total', 'totalPages']),
    });
  });

  it('validates the page presenter response against the ReviewPage schema', async () => {
    const api = (await SwaggerParser.dereference(contractPath)) as unknown as DereferencedApi;
    const schema = api.components?.schemas?.ReviewPage;
    expect(schema).toBeDefined();

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema as object);
    const review = Review.create({
      id: REVIEW_ID,
      bookingId: BOOKING,
      propertyId: PROPERTY,
      guestId: GUEST,
      rating: 5,
      comment: 'Excelente',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(validate(presentReviewPage(buildReviewPage([review], 1, 20, 1)))).toBe(true);
  });

  it('keeps the own history operation aligned with the source contract', async () => {
    const api = (await SwaggerParser.dereference(contractPath)) as unknown as DereferencedApi;
    const operation = api.paths?.['/internal/v1/reviews/user/{userId}']?.get;
    expect(operation?.operationId).toBe('listOwnReviews');
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
  });

  it('exposes the implemented own history route in generated Swagger', () => {
    const operation = generatedOperation(app, '/internal/v1/reviews/user/{userId}', 'get');
    expect(operation).toBeDefined();
    expect(Object.keys(operation.responses ?? {}).sort()).toEqual(['200', '400', '401', '403']);
    expect(operation.security).toContainEqual({ userBearer: [] });
    expect(operation.responses?.['200']?.content?.['application/json']?.schema).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(['items', 'page', 'pageSize', 'total', 'totalPages']),
    });
  });
});
