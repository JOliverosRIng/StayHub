import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { BookingsClient, type BookingsRequestContext } from '@gateway/infrastructure/http/bookings.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { principalFrom } from '@gateway/modules/auth/access.guard';
import { Roles } from '@gateway/modules/auth/roles.guard';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('bookings') @ApiBearerAuth() @Controller('bookings')
export class BookingsController {
  public constructor(private readonly bookings: BookingsClient) {}

  @Post() @Roles('GUEST')
  public create(@Body() body: CreateBookingDto, @Headers('idempotency-key') key: string | undefined, @Req() request: Request): Promise<unknown> {
    if (!key || !/^[A-Za-z0-9._:-]{16,128}$/u.test(key)) throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY' });
    return this.bookings.request(context(request), 'POST', '/bookings', body, key);
  }

  @Get('history') @Roles('OWNER')
  public history(@Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'GET', `/bookings/history${allowedQuery(request, ['from', 'to', 'status', 'guestId', 'page', 'pageSize'])}`);
  }

  @Get(':bookingId')
  public get(@Param('bookingId') bookingId: string, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'GET', `/bookings/${uuid(bookingId)}`);
  }

  @Delete(':bookingId')
  public remove(@Param('bookingId') bookingId: string, @Body() body: CancelBookingDto, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'DELETE', `/bookings/${uuid(bookingId)}`, body);
  }

  @Post(':bookingId/check-in') @Roles('OWNER')
  public checkIn(@Param('bookingId') bookingId: string, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'POST', `/bookings/${uuid(bookingId)}/check-in`);
  }

  @Post(':bookingId/check-out') @Roles('OWNER')
  public checkOut(@Param('bookingId') bookingId: string, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'POST', `/bookings/${uuid(bookingId)}/check-out`);
  }
}

function context(request: Request): BookingsRequestContext {
  const principal = principalFrom(request);
  if (!principal) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });
  return { traceId: traceIdFromRequest(request), userId: principal.userId, role: principal.role };
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new BadRequestException({ code: 'INVALID_BOOKING_ID' });
  return encodeURIComponent(value);
}

function allowedQuery(request: Request, names: readonly string[]): string {
  if (Object.keys(request.query).some((key) => !names.includes(key))) throw new BadRequestException({ code: 'UNKNOWN_QUERY_PARAMETER' });
  const params = new URLSearchParams();
  for (const name of names) {
    const value = request.query[name];
    if (typeof value === 'string') params.set(name, value);
    else if (value !== undefined) throw new BadRequestException({ code: 'INVALID_QUERY_PARAMETER' });
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
