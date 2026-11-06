import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { CancelOwnerBookingUseCase } from '@bookings/application/cancel-booking/cancel-owner-booking.use-case';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { CreateBookingDto, assertIdempotencyKey } from '@bookings/interfaces/http/dto/create-booking.dto';
import { assertBookingId } from '@bookings/interfaces/http/dto/get-booking.dto';
import { OwnerBookingHistoryQueryDto } from '@bookings/interfaces/http/dto/owner-booking-history.dto';
import { ServiceAuthGuard, type AuthenticatedRequest } from '@bookings/interfaces/http/guards/service-auth.guard';
import { presentBooking, type BookingView } from './booking.presenter';
import { presentBookingPage, type BookingPageView } from './booking-page.presenter';

@ApiTags('bookings') @ApiBearerAuth() @Controller('bookings') @UseGuards(ServiceAuthGuard)
export class BookingsController {
  public constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly cancelGuestBooking: CancelGuestBookingUseCase,
    private readonly cancelOwnerBooking: CancelOwnerBookingUseCase,
    private readonly ownerHistory: GetOwnerBookingHistoryUseCase,
  ) {}

  @Post() @ApiOperation({ summary: 'Create an idempotent pending booking' }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiCreatedResponse({ description: 'Booking created or replayed' })
  public async create(@Body() body: CreateBookingDto, @Headers('idempotency-key') key: string | undefined, @Req() request: AuthenticatedRequest & { traceId?: string }): Promise<BookingView> {
    if (request.principal?.role !== 'GUEST') throw new ForbiddenException('GUEST role required');
    const booking = await this.createBooking.execute({ guestId: request.principal.sub, propertyId: body.propertyId, roomId: body.roomId, checkIn: body.checkIn, checkOut: body.checkOut, guests: body.guests, idempotencyKey: assertIdempotencyKey(key), ...(request.traceId ? { traceId: request.traceId } : {}) });
    return presentBooking(booking);
  }

  @Get('history') @ApiOperation({ summary: 'List bookings received by the authenticated owner' }) @ApiOkResponse({ description: 'Paged owner bookings ordered by createdAt DESC, id DESC' })
  public async history(@Query() query: OwnerBookingHistoryQueryDto, @Req() request: AuthenticatedRequest): Promise<BookingPageView> {
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Authenticated principal required');
    if (principal.role !== 'OWNER') throw new ForbiddenException('OWNER role required');
    const page = await this.ownerHistory.execute({
      ownerId: principal.sub,
      ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}),
      ...(query.status ? { status: query.status } : {}), ...(query.guestId ? { guestId: query.guestId } : {}),
      page: query.page, pageSize: query.pageSize,
    });
    return presentBookingPage(page, { role: 'OWNER', sub: principal.sub });
  }

  @Get(':bookingId') @ApiOperation({ summary: 'Get a booking authorized for the caller' }) @ApiParam({ name: 'bookingId', required: true, schema: { type: 'string', format: 'uuid' } }) @ApiOkResponse({ description: 'Booking owned by the guest or received by the owner' })
  public async get(@Param('bookingId') bookingId: string, @Req() request: AuthenticatedRequest): Promise<BookingView> {
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Authenticated principal required');
    const result = await this.getBooking.execute({ bookingId: assertBookingId(bookingId), actorId: principal.sub, ...(principal.role ? { actorRole: principal.role } : {}) });
    return presentBooking(result.booking, result.viewer);
  }

  @Delete(':bookingId') @ApiOperation({ summary: 'Cancel a booking as its guest or owner' }) @ApiParam({ name: 'bookingId', required: true, schema: { type: 'string', format: 'uuid' } }) @ApiOkResponse({ description: 'Booking cancelled; refund may remain pending' })
  public async remove(@Param('bookingId') bookingId: string, @Body() body: { reason?: unknown } | undefined, @Req() request: AuthenticatedRequest): Promise<BookingView> {
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Authenticated principal required');
    const id = assertBookingId(bookingId);
    if (principal.role === 'GUEST') {
      const booking = await this.cancelGuestBooking.execute({ bookingId: id, actorId: principal.sub });
      return presentBooking(booking, { role: 'GUEST', sub: principal.sub });
    }
    if (principal.role === 'OWNER') {
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
      if (!reason || reason.length > 500) throw new BadRequestException('REASON_REQUIRED');
      const booking = await this.cancelOwnerBooking.execute({ bookingId: id, ownerId: principal.sub, reason });
      return presentBooking(booking, { role: 'OWNER', sub: principal.sub });
    }
    throw new ForbiddenException('GUEST or OWNER role required');
  }
}
