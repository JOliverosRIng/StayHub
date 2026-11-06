import { Controller, ForbiddenException, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CheckInBookingUseCase } from '@bookings/application/stay-lifecycle/check-in-booking.use-case';
import { CheckOutBookingUseCase } from '@bookings/application/stay-lifecycle/check-out-booking.use-case';
import { assertBookingId } from '@bookings/interfaces/http/dto/get-booking.dto';
import { ServiceAuthGuard, type AuthenticatedRequest } from '@bookings/interfaces/http/guards/service-auth.guard';
import { presentBooking, type BookingView } from './booking.presenter';

@ApiTags('bookings') @ApiBearerAuth() @Controller('bookings') @UseGuards(ServiceAuthGuard)
export class StayLifecycleController {
  public constructor(private readonly checkInBooking: CheckInBookingUseCase, private readonly checkOutBooking: CheckOutBookingUseCase) {}

  @Post(':bookingId/check-in') @HttpCode(200) @ApiOperation({ summary: 'Register a basic check-in for an owner booking' }) @ApiParam({ name: 'bookingId', required: true, schema: { type: 'string', format: 'uuid' } }) @ApiOkResponse({ description: 'Booking checked in' })
  public async checkIn(@Param('bookingId') bookingId: string, @Req() request: AuthenticatedRequest): Promise<BookingView> {
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Authenticated principal required');
    if (principal.role !== 'OWNER') throw new ForbiddenException('OWNER role required');
    const booking = await this.checkInBooking.execute({ bookingId: assertBookingId(bookingId), ownerId: principal.sub });
    return presentBooking(booking, { role: 'OWNER', sub: principal.sub });
  }

  @Post(':bookingId/check-out') @HttpCode(200) @ApiOperation({ summary: 'Register check-out and complete the stay' }) @ApiParam({ name: 'bookingId', required: true, schema: { type: 'string', format: 'uuid' } }) @ApiOkResponse({ description: 'Stay completed' })
  public async checkOut(@Param('bookingId') bookingId: string, @Req() request: AuthenticatedRequest): Promise<BookingView> {
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Authenticated principal required');
    if (principal.role !== 'OWNER') throw new ForbiddenException('OWNER role required');
    const booking = await this.checkOutBooking.execute({ bookingId: assertBookingId(bookingId), ownerId: principal.sub });
    return presentBooking(booking, { role: 'OWNER', sub: principal.sub });
  }
}
