import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdempotencyConflictError, NotificationStorageError, SendNotificationUseCase } from '../../../application/notifications/send-notification.use-case';
import { ListUserNotificationsUseCase } from '../../../application/notifications/list-user-notifications.use-case';
import { SendAuthGuard } from '../guards/send-auth.guard';
import { AccessJwtGuard } from '../guards/access-jwt.guard';
import { NotificationOwnershipGuard } from '../guards/notification-ownership.guard';
import { SendNotificationDto } from './send-notification.dto';
import { ListNotificationsQueryDto } from './list-notifications-query.dto';
import { InvalidNotificationCursorError } from '../../../domain/notifications/notification-cursor';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly sendNotification: SendNotificationUseCase, private readonly listNotifications: ListUserNotificationsUseCase) {}

  @Post('send')
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
