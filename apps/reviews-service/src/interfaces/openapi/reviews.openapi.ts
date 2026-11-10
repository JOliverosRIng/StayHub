import { applyDecorators, type INestApplication } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const CREATE_REVIEW_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['bookingId', 'rating', 'comment'],
  properties: {
    bookingId: { type: 'string', format: 'uuid' },
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    comment: { type: 'string', minLength: 1, maxLength: 2000 },
  },
};

export const REVIEW_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'propertyId', 'rating', 'comment', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    propertyId: { type: 'string', format: 'uuid' },
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    comment: { type: 'string', minLength: 1, maxLength: 2000 },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const REVIEW_PAGE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: REVIEW_SCHEMA },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  },
};

export const PROBLEM_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'detail', 'instance', 'code', 'traceId', 'errors'],
  properties: {
    type: { type: 'string', format: 'uri-reference' },
    title: { type: 'string' },
    status: { type: 'integer', minimum: 400, maximum: 599 },
    detail: { type: 'string' },
    instance: { type: 'string' },
    code: { type: 'string' },
    traceId: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'code'],
        properties: { field: { type: 'string' }, code: { type: 'string' } },
      },
    },
  },
};

function problem(status: number): MethodDecorator {
  return ApiResponse({
    status,
    description: 'Problem Details seguro con código estable y traceId.',
    content: { 'application/problem+json': { schema: PROBLEM_SCHEMA } },
  });
}

export function ApiCreateReviewContract(): MethodDecorator {
  return applyDecorators(
    ApiBody({ schema: CREATE_REVIEW_SCHEMA }),
    ApiCreatedResponse({ description: 'Review created for the authenticated guest.', schema: REVIEW_SCHEMA }),
    ...[400, 401, 403, 404, 409, 503].map(problem),
  );
}

export function ApiPropertyReviewsContract(): MethodDecorator {
  return applyDecorators(
    ApiOkResponse({ description: 'Stable page ordered by createdAt DESC, id DESC', schema: REVIEW_PAGE_SCHEMA }),
    ...[400, 401, 403].map(problem),
  );
}

export function ApiOwnReviewsContract(): MethodDecorator {
  return applyDecorators(
    ApiOkResponse({ description: 'Own review page ordered by createdAt DESC, id DESC', schema: REVIEW_PAGE_SCHEMA }),
    ...[400, 401, 403].map(problem),
  );
}

export function buildReviewsOpenApiConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('StayHub Reviews Service')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT RS256' }, 'userBearer')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT RS256' }, 'serviceJwt')
    .build();
}

export function configureReviewsOpenApi(app: INestApplication): void {
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, buildReviewsOpenApiConfig()));
}
