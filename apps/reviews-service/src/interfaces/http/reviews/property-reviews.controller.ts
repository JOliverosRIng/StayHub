import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ListPropertyReviewsUseCase } from '@reviews/application/list-property-reviews/list-property-reviews.use-case';
import { ReviewPageDto } from '@reviews/interfaces/http/dto/review-page.dto';
import { ServiceAuthGuard } from '@reviews/interfaces/http/guards/service-auth.guard';
import { assertUuid, parsePagination } from '@reviews/interfaces/http/http-params';
import { presentReviewPage } from './review.presenter';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('internal/v1/properties')
@UseGuards(ServiceAuthGuard)
export class PropertyReviewsController {
  public constructor(private readonly listPropertyReviews: ListPropertyReviewsUseCase) {}

  @Get(':propertyId/reviews')
  @ApiOperation({
    operationId: 'listPropertyReviews',
    summary: 'List public reviews of a property',
  })
  @ApiParam({ name: 'propertyId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ description: 'Stable page ordered by createdAt DESC, id DESC', type: ReviewPageDto })
  public async list(
    @Param('propertyId') propertyId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ReviewPageDto> {
    const id = assertUuid(propertyId, 'propertyId');
    const pagination = parsePagination(page, pageSize);
    const result = await this.listPropertyReviews.execute({
      propertyId: id,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    return presentReviewPage(result);
  }
}
