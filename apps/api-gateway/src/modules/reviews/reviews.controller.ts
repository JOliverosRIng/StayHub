import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import {
  ReviewsClient,
  type ReviewPage,
  type ReviewView,
  type ReviewsRequestContext,
} from '@gateway/infrastructure/http/reviews.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { principalFrom } from '@gateway/modules/auth/access.guard';
import { extractBearerToken } from '@gateway/modules/auth/jwt.strategy';
import { Public } from '@gateway/modules/auth/public.decorator';
import { Roles } from '@gateway/modules/auth/roles.guard';

import { CreateReviewDto } from './dto/create-review.dto';
import { CreateReviewApiDocs, OwnReviewsApiDocs, PropertyReviewsApiDocs } from './reviews.openapi';

@Controller()
export class ReviewsController {
  public constructor(private readonly reviews: ReviewsClient) {}

  @Post('reviews')
  @Roles('GUEST')
  @CreateReviewApiDocs()
  public create(@Body() body: CreateReviewDto, @Req() request: Request): Promise<ReviewView> {
    return this.reviews.create(body, userContext(request));
  }

  @Get('properties/:propertyId/reviews')
  @Public()
  @PropertyReviewsApiDocs()
  public listProperty(@Req() request: Request): Promise<ReviewPage> {
    return this.reviews.listProperty(
      routeValue(request, 'propertyId'),
      paginationQuery(request),
      traceIdFromRequest(request),
    );
  }

  @Get('reviews/user/:userId')
  @OwnReviewsApiDocs()
  public listOwn(@Req() request: Request): Promise<ReviewPage> {
    const userId = routeValue(request, 'userId');
    if (principalFrom(request)?.userId !== userId) {
      throw new ForbiddenException({ code: 'REVIEW_HISTORY_FORBIDDEN' });
    }
    return this.reviews.listOwn(userId, paginationQuery(request), userContext(request));
  }
}

function routeValue(request: Request, name: string): string {
  return request.params[name] ?? '';
}

function userContext(request: Request): ReviewsRequestContext {
  return {
    traceId: traceIdFromRequest(request),
    bearer: extractBearerToken(request) ?? '',
  };
}

function paginationQuery(request: Request): string {
  const allowed = new Set(['page', 'pageSize']);
  if (Object.keys(request.query).some((key) => !allowed.has(key))) {
    throw new BadRequestException({ code: 'UNKNOWN_QUERY_PARAMETER' });
  }
  const params = new URLSearchParams();
  for (const name of allowed) {
    const value = request.query[name];
    if (typeof value === 'string') params.set(name, value);
    else if (value !== undefined) throw new BadRequestException({ code: 'INVALID_PAGINATION' });
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
