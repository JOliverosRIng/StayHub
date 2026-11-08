import { BadRequestException, Body, ConflictException, Controller, Headers, Post, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdempotencyConflictError, NotificationStorageError, SendNotificationUseCase } from '../../../application/notifications/send-notification.use-case';
import { SendAuthGuard } from '../guards/send-auth.guard';
import { SendNotificationDto } from './send-notification.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly sendNotification: SendNotificationUseCase) {}

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
}
