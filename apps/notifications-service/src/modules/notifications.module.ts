import { Module } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY } from '../application/ports/notification.repository';
import { PrismaNotificationRepository } from '../infrastructure/persistence/prisma/notification.repository';
import { DELIVERY_ADAPTERS } from '../application/ports/delivery.port';
import { SendNotificationUseCase } from '../application/notifications/send-notification.use-case';

@Module({
  providers: [
    { provide: NOTIFICATION_REPOSITORY, useExisting: PrismaNotificationRepository },
    { provide: SendNotificationUseCase, useFactory: (repository: PrismaNotificationRepository, delivery: ConstructorParameters<typeof SendNotificationUseCase>[1]): SendNotificationUseCase => new SendNotificationUseCase(repository, delivery), inject: [NOTIFICATION_REPOSITORY, DELIVERY_ADAPTERS] },
  ],
  exports: [NOTIFICATION_REPOSITORY, SendNotificationUseCase],
})
export class NotificationsModule {}
