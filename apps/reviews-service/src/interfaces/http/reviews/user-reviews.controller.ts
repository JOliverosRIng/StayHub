import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ListOwnReviewsUseCase } from '@reviews/application/list-user-reviews/list-own-reviews.use-case';
import { ReviewPageDto } from '@reviews/interfaces/http/dto/review-page.dto';
import {
  UserAuthGuard,
  type UserAuthenticatedRequest,
} from '@reviews/interfaces/http/guards/user-auth.guard';
import { assertUuid, parsePagination } from '@reviews/interfaces/http/http-params';
import { ApiOwnReviewsContract } from '@reviews/interfaces/openapi/reviews.openapi';
import { presentReviewPage } from './review.presenter';

@ApiTags('reviews')
@ApiBearerAuth('userBearer')
@Controller('internal/v1/reviews')
@UseGuards(UserAuthGuard)
export class UserReviewsController {
  public constructor(private readonly listOwnReviews: ListOwnReviewsUseCase) {}

  @Get('user/:userId')
  @ApiOperation({
    operationId: 'listOwnReviews',
    summary: 'List the authenticated user own reviews',
  })
  @ApiParam({ name: 'userId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOwnReviewsContract()
  public async list(
    @Param('userId') userId: string,
    @Req() request: UserAuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ReviewPageDto> {
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Authenticated principal required');

    const id = assertUuid(userId, 'userId');
    const pagination = parsePagination(page, pageSize);
    const result = await this.listOwnReviews.execute({
      principalSub: principal.sub,
      userId: id,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    return presentReviewPage(result);
  }
}
