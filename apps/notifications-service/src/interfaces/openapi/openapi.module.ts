import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../modules/notifications.module';

@Module({ imports: [NotificationsModule] })
export class NotificationsOpenApiModule {}
