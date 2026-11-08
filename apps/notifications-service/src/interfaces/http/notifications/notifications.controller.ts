import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdempotencyConflictError, NotificationStorageError, SendNotificationUseCase } from '../../../application/notifications/send-notification.use-case';
import { BookingConfirmedUseCase, InvalidBookingEventError } from '../../../application/notifications/booking-confirmed.use-case';
import { ReminderScheduleConflictError } from '../../../application/ports/reminder-schedule.repository';
import { ListUserNotificationsUseCase } from '../../../application/notifications/list-user-notifications.use-case';
import { SendAuthGuard } from '../guards/send-auth.guard';
import { AccessJwtGuard } from '../guards/access-jwt.guard';
import { NotificationOwnershipGuard } from '../guards/notification-ownership.guard';
import { SendNotificationDto } from './send-notification.dto';
import { BookingConfirmedDto } from './booking-confirmed.dto';
import { ListNotificationsQueryDto } from './list-notifications-query.dto';
import { InvalidNotificationCursorError } from '../../../domain/notifications/notification-cursor';
import { ServiceJwtGuard } from '../guards/service-jwt.guard';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly sendNotification: SendNotificationUseCase,
    private readonly listNotifications: ListUserNotificationsUseCase,
    private readonly bookingConfirmed: BookingConfirmedUseCase,
  ) {}

  @Post('events/booking-confirmed')
  @ApiOperation({ operationId: 'bookingConfirmedEvent', summary: 'Record a booking confirmation and schedule its check-in reminder' })
  @UseGuards(ServiceJwtGuard)
  @ApiBearerAuth('serviceJwt')
  @ApiBody({ type: BookingConfirmedDto })
  @ApiCreatedResponse({
    description: 'Confirmation created and check-in reminder scheduled.',
    schema: {
      type: 'object',
      required: ['confirmation', 'reminderScheduledAt'],
      properties: {
        confirmation: {
          type: 'object',
          required: ['id', 'userId', 'type', 'channel', 'subject', 'body', 'status', 'createdAt', 'sentAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['BOOKING_CONFIRMATION', 'CHECKIN_REMINDER', 'SYSTEM_ALERT'] },
            channel: { type: 'string', enum: ['EMAIL', 'IN_APP'] },
            subject: { type: 'string' },
            body: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'SENT', 'FAILED'] },
            createdAt: { type: 'string', format: 'date-time' },
            sentAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        reminderScheduledAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async bookingConfirmedEvent(@Body() dto: BookingConfirmedDto): Promise<unknown> {
    try {
      return await this.bookingConfirmed.execute(dto);
    } catch (error) {
      if (error instanceof IdempotencyConflictError || error instanceof ReminderScheduleConflictError) {
        throw new ConflictException('Booking confirmation conflicts with an existing event');
      }
      if (error instanceof InvalidBookingEventError) throw new BadRequestException('Invalid booking event');
      if (error instanceof NotificationStorageError) throw new ServiceUnavailableException('Notification storage is unavailable');
      throw new ServiceUnavailableException('Booking notification could not be processed');
    }
  }

  @Post('send')
  @ApiOperation({ operationId: 'sendNotification', summary: 'Create or replay a notification' })
  @UseGuards(SendAuthGuard)
  @ApiBearerAuth('accessJwt')
  @ApiBearerAuth('serviceJwt')
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } })
  @ApiCreatedResponse({ description: 'Notification was recorded.' })
  async send(@Body() dto: SendNotificationDto, @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) response: Response): Promise<unknown> {
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key)) throw new BadRequestException('A valid Idempotency-Key header is required');
    try {
      const result = await this.sendNotification.execute({
        userId: dto.userId, type: dto.type, channel: dto.channel,
        ...(dto.recipientEmail ? { recipientEmail: dto.recipientEmail } : {}),
        templateData: dto.templateData, idempotencyKey: key,
      });
      response.status(result.replayed ? 200 : 201);
      return result.notification;
    } catch (error) {
      if (error instanceof IdempotencyConflictError) throw new ConflictException('Idempotency key conflicts with existing content');
      if (error instanceof NotificationStorageError) throw new ServiceUnavailableException('Notification storage is unavailable');
      throw error;
    }
  }

  @Get('user/:id')
  @ApiOperation({ operationId: 'listUserNotifications', summary: 'List notifications for their owner or an administrator' })
  @UseGuards(AccessJwtGuard, NotificationOwnershipGuard)
  @ApiBearerAuth('accessJwt')
  @ApiOkResponse({ description: 'Private paginated notification history.' })
  async list(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: ListNotificationsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    response.setHeader('Cache-Control', 'no-store');
    try {
      return await this.listNotifications.execute({ userId: id, ...query });
    } catch (error) {
      if (error instanceof InvalidNotificationCursorError) throw new BadRequestException('Invalid notification cursor');
      throw error;
    }
  }
}
