import type { NotificationRecord, NotificationStatus, NotificationType } from '../../domain/notifications/notification.types';

export type NewNotification = Omit<NotificationRecord, 'id' | 'createdAt'>;
export interface NotificationFilter { userId: string; status?: NotificationStatus; type?: NotificationType; cursor?: { createdAt: Date; id: string }; take: number }
export interface NotificationRepository {
  create(record: NewNotification): Promise<NotificationRecord>;
  findByIdempotencyKey(key: string): Promise<NotificationRecord | null>;
  findByIdempotencyKeyOrCreate(record: NewNotification): Promise<{ record: NotificationRecord; created: boolean }>;
  updateDelivery(id: string, status: 'SENT' | 'FAILED', sentAt: Date | null, failureReason: string | null): Promise<NotificationRecord>;
  list(filter: NotificationFilter): Promise<NotificationRecord[]>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
