import { Module } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY } from '../application/ports/notification.repository';
import { REMINDER_SCHEDULE_REPOSITORY } from '../application/ports/reminder-schedule.repository';
import { PrismaNotificationRepository } from '../infrastructure/persistence/prisma/notification.repository';
import { DELIVERY_ADAPTERS } from '../application/ports/delivery.port';
import { SendNotificationUseCase } from '../application/notifications/send-notification.use-case';
import { NotificationsController } from '../interfaces/http/notifications/notifications.controller';
import { ListUserNotificationsUseCase } from '../application/notifications/list-user-notifications.use-case';
import { BookingConfirmedUseCase } from '../application/notifications/booking-confirmed.use-case';
import { CheckinReminderScheduler } from '../infrastructure/scheduling/checkin-reminder.scheduler';

@Module({
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATION_REPOSITORY, useExisting: PrismaNotificationRepository },
    { provide: REMINDER_SCHEDULE_REPOSITORY, useExisting: PrismaNotificationRepository },
    { provide: ListUserNotificationsUseCase, useFactory: (repository: PrismaNotificationRepository): ListUserNotificationsUseCase => new ListUserNotificationsUseCase(repository), inject: [NOTIFICATION_REPOSITORY] },
    { provide: SendNotificationUseCase, useFactory: (repository: PrismaNotificationRepository, delivery: ConstructorParameters<typeof SendNotificationUseCase>[1]): SendNotificationUseCase => new SendNotificationUseCase(repository, delivery), inject: [NOTIFICATION_REPOSITORY, DELIVERY_ADAPTERS] },
    { provide: BookingConfirmedUseCase, useFactory: (send: SendNotificationUseCase, reminders: PrismaNotificationRepository): BookingConfirmedUseCase => new BookingConfirmedUseCase(send, reminders), inject: [SendNotificationUseCase, REMINDER_SCHEDULE_REPOSITORY] },
    CheckinReminderScheduler,
  ],
  exports: [NOTIFICATION_REPOSITORY, SendNotificationUseCase, ListUserNotificationsUseCase, BookingConfirmedUseCase],
})
export class NotificationsModule {}
