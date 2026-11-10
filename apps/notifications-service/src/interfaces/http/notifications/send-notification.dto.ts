import { IsEmail, IsEnum, IsObject, IsString, IsUUID, Length, Validate, ValidateIf, ValidatorConstraint, type ValidationArguments, type ValidatorConstraintInterface } from 'class-validator';
import { renderNotification } from '../../../domain/notifications/notification.policy';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, type NotificationType } from '../../../domain/notifications/notification.types';

@ValidatorConstraint({ name: 'templateDataMatchesType', async: false })
export class TemplateDataMatchesType implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    const type = args?.object && 'type' in args.object ? args.object.type : undefined;
    try { if (typeof type !== 'string') return false; renderNotification(type as NotificationType, value); return true; }
    catch { return false; }
  }
  defaultMessage(): string { return 'templateData does not match the selected notification type'; }
}

export class SendNotificationDto {
  @IsUUID('4')
  userId!: string;

  @IsEnum(NOTIFICATION_TYPES)
  type!: NotificationType;

  @IsEnum(NOTIFICATION_CHANNELS)
  channel!: typeof NOTIFICATION_CHANNELS[number];

  @ValidateIf((dto: SendNotificationDto) => dto.channel === 'EMAIL')
  @IsString()
  @Length(1, 254)
  @IsEmail()
  recipientEmail?: string;

  @IsObject()
  @Validate(TemplateDataMatchesType)
  templateData!: Record<string, unknown>;
}
