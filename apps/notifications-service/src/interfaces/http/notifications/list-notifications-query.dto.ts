import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES, type NotificationStatus, type NotificationType } from '../../../domain/notifications/notification.types';

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  @Matches(/^[A-Za-z0-9_-]+$/)
  cursor?: string;

  @IsOptional()
  @IsEnum(NOTIFICATION_STATUSES)
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(NOTIFICATION_TYPES)
  type?: NotificationType;
}
