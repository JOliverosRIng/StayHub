import { Module } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY } from '../application/ports/notification.repository';
import { PrismaNotificationRepository } from '../infrastructure/persistence/prisma/notification.repository';
import { DELIVERY_ADAPTERS } from '../application/ports/delivery.port';
import { SendNotificationUseCase } from '../application/notifications/send-notification.use-case';
import { NotificationsController } from '../interfaces/http/notifications/notifications.controller';
import { ListUserNotificationsUseCase } from '../application/notifications/list-user-notifications.use-case';

@Module({
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATION_REPOSITORY, useExisting: PrismaNotificationRepository },
    { provide: ListUserNotificationsUseCase, useFactory: (repository: PrismaNotificationRepository): ListUserNotificationsUseCase => new ListUserNotificationsUseCase(repository), inject: [NOTIFICATION_REPOSITORY] },
    { provide: SendNotificationUseCase, useFactory: (repository: PrismaNotificationRepository, delivery: ConstructorParameters<typeof SendNotificationUseCase>[1]): SendNotificationUseCase => new SendNotificationUseCase(repository, delivery), inject: [NOTIFICATION_REPOSITORY, DELIVERY_ADAPTERS] },
  ],
  exports: [NOTIFICATION_REPOSITORY, SendNotificationUseCase, ListUserNotificationsUseCase],
})
export class NotificationsModule {}
