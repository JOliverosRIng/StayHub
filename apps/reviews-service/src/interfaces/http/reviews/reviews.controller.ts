import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateReviewUseCase } from '@reviews/application/create-review/create-review.use-case';
import { CreateReviewDto } from '@reviews/interfaces/http/dto/create-review.dto';
import {
  UserAuthGuard,
  type UserAuthenticatedRequest,
} from '@reviews/interfaces/http/guards/user-auth.guard';
import { presentReview, type ReviewView } from './review.presenter';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('internal/v1/reviews')
@UseGuards(UserAuthGuard)
export class ReviewsController {
  public constructor(private readonly createReview: CreateReviewUseCase) {}

  @Post()
  @ApiOperation({ operationId: 'createReview', summary: 'Create a review for a completed stay' })
  @ApiCreatedResponse({ description: 'Review created for the authenticated guest.' })
  public async create(
    @Body() body: CreateReviewDto,
    @Req() request: UserAuthenticatedRequest & { traceId?: string },
  ): Promise<ReviewView> {
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Authenticated principal required');
    if (principal.role !== 'GUEST') throw new ForbiddenException('GUEST role required');

    const review = await this.createReview.execute({
      bookingId: body.bookingId,
      rating: body.rating,
      comment: body.comment,
      guestId: principal.sub,
      role: principal.role,
      traceId: request.traceId ?? 'unavailable',
    });

    return presentReview(review);
  }
}
