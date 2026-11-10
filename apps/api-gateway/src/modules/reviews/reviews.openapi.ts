import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const TAG = 'Reviews';
const PROBLEM = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } };
const REVIEW: SchemaObject = {
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
const PAGE: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: REVIEW },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  },
};

function problem(status: number, description: string): ReturnType<typeof ApiResponse> {
  return ApiResponse({ status, description, content: PROBLEM });
}

function pagination(): Array<MethodDecorator & ClassDecorator> {
  return [
    ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } }),
    ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }),
  ];
}

export function CreateReviewApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'createReview', summary: 'Create a review for a completed stay' }),
    ApiBearerAuth('bearerAuth'),
    ApiBody({ schema: {
      type: 'object', additionalProperties: false, required: ['bookingId', 'rating', 'comment'],
      properties: {
        bookingId: { type: 'string', format: 'uuid' },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        comment: { type: 'string', minLength: 1, maxLength: 2000 },
      },
    } }),
    ApiResponse({ status: 201, description: 'Review created.', schema: REVIEW }),
    problem(400, 'Invalid payload.'), problem(401, 'Invalid authentication.'),
    problem(403, 'Only a guest may create a review.'), problem(404, 'Eligible booking not found.'),
    problem(409, 'The booking already has a review.'), problem(503, 'Reviews or Bookings is unavailable.'),
  );
}

export function PropertyReviewsApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'listPropertyReviews', summary: 'List public reviews for a property' }),
    ApiParam({ name: 'propertyId', schema: { type: 'string', format: 'uuid' } }),
    ...pagination(),
    ApiResponse({ status: 200, description: 'Paginated public reviews.', schema: PAGE }),
    problem(400, 'Invalid property or pagination.'), problem(503, 'Reviews is unavailable.'),
  );
}

export function OwnReviewsApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'listOwnReviews', summary: 'List the authenticated user reviews' }),
    ApiBearerAuth('bearerAuth'),
    ApiParam({ name: 'userId', schema: { type: 'string', format: 'uuid' } }),
    ...pagination(),
    ApiResponse({ status: 200, description: 'Paginated own reviews.', schema: PAGE }),
    problem(400, 'Invalid user or pagination.'), problem(401, 'Invalid authentication.'),
    problem(403, 'The requested history belongs to another user.'), problem(503, 'Reviews is unavailable.'),
  );
}
