import { Body, Controller, ForbiddenException, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { CreateBookingDto, assertIdempotencyKey } from '@bookings/interfaces/http/dto/create-booking.dto';
import { ServiceAuthGuard, type AuthenticatedRequest } from '@bookings/interfaces/http/guards/service-auth.guard';
import { presentBooking } from './booking.presenter';

@ApiTags('bookings') @ApiBearerAuth() @Controller('bookings') @UseGuards(ServiceAuthGuard)
export class BookingsController {
  public constructor(private readonly createBooking: CreateBookingUseCase) {}
  @Post() @ApiOperation({ summary: 'Create an idempotent pending booking' }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiCreatedResponse({ description: 'Booking created or replayed' })
  public async create(@Body() body: CreateBookingDto, @Headers('idempotency-key') key: string | undefined, @Req() request: AuthenticatedRequest & { traceId?: string }): Promise<ReturnType<typeof presentBooking>> {
    if (request.principal?.role !== 'GUEST') throw new ForbiddenException('GUEST role required');
    const booking = await this.createBooking.execute({ guestId: request.principal.sub, propertyId: body.propertyId, roomId: body.roomId, checkIn: body.checkIn, checkOut: body.checkOut, guests: body.guests, idempotencyKey: assertIdempotencyKey(key), ...(request.traceId ? { traceId: request.traceId } : {}) });
    return presentBooking(booking);
  }
}
