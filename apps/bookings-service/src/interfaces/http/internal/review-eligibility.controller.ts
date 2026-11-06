import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { GetReviewEligibilityUseCase, type ReviewEligibility } from '@bookings/application/stay-lifecycle/get-review-eligibility.use-case';
import { assertBookingId, assertUuid } from '@bookings/interfaces/http/dto/get-booking.dto';
import { ReviewServiceGuard } from '@bookings/interfaces/http/guards/review-service.guard';

@ApiTags('internal') @ApiBearerAuth() @Controller('internal/v1/bookings') @UseGuards(ReviewServiceGuard)
export class ReviewEligibilityController {
  public constructor(private readonly eligibility: GetReviewEligibilityUseCase) {}

  @Get(':bookingId/review-eligibility') @ApiOperation({ summary: 'Authoritative review eligibility for the Reviews service' }) @ApiParam({ name: 'bookingId', required: true, schema: { type: 'string', format: 'uuid' } }) @ApiOkResponse({ description: 'Eligibility result or 404 without disclosing foreign bookings' })
  public async get(@Param('bookingId') bookingId: string, @Query('guestId') guestId: string | undefined): Promise<ReviewEligibility> {
    return this.eligibility.execute({ bookingId: assertBookingId(bookingId), guestId: assertUuid(guestId, 'INVALID_GUEST_ID') });
  }
}
