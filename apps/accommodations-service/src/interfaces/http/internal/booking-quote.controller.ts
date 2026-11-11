import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetBookingQuoteUseCase, type BookingQuote } from '@accommodations/application/properties/get-booking-quote.use-case';
import { parseUuid } from '@accommodations/domain/shared/uuid';
import { ServiceAuthGuard } from '../auth/service-auth.guard';

@ApiTags('internal')
@ApiBearerAuth('serviceJwt')
@Controller('internal/v1/properties')
@UseGuards(ServiceAuthGuard)
export class BookingQuoteController {
  constructor(private readonly quotes: GetBookingQuoteUseCase) {}

  @Get(':propertyId/rooms/:roomId/booking-quote')
  @ApiOperation({ operationId: 'getBookingQuote', summary: 'Authoritative bookable snapshot for Bookings' })
  @ApiParam({ name: 'propertyId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'roomId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'guests', required: true, schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ description: 'Published property and room with valid capacity and base price.' })
  @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 409 }) @ApiResponse({ status: 503 })
  async get(
    @Param('propertyId') propertyId: string,
    @Param('roomId') roomId: string,
    @Query('guests') guests: string | undefined,
  ): Promise<BookingQuote> {
    const parsed = Number(guests);
    if (!guests || !Number.isSafeInteger(parsed) || parsed < 1) throw new BadRequestException({ code: 'INVALID_GUESTS' });
    return this.quotes.execute(parseUuid(propertyId, 'propertyId'), parseUuid(roomId, 'roomId'), parsed);
  }
}
