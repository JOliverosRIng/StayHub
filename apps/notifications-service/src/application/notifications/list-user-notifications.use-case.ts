import type { NotificationRepository } from '../ports/notification.repository';
import type { NotificationStatus, NotificationType, NotificationView } from '../../domain/notifications/notification.types';
import { toNotificationView } from '../../domain/notifications/notification.types';
import { decodeNotificationCursor, encodeNotificationCursor } from '../../domain/notifications/notification-cursor';

export interface ListNotificationsQuery { userId: string; limit?: number; cursor?: string; status?: NotificationStatus; type?: NotificationType }
export interface NotificationPage { items: NotificationView[]; nextCursor: string | null }

export class ListUserNotificationsUseCase {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(query: ListNotificationsQuery): Promise<NotificationPage> {
    const limit = query.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page limit');
    const cursor = query.cursor ? decodeNotificationCursor(query.cursor) : undefined;
    const rows = await this.repository.list({
      userId: query.userId, take: limit + 1,
      ...(cursor ? { cursor } : {}), ...(query.status ? { status: query.status } : {}), ...(query.type ? { type: query.type } : {}),
    });
    const hasNext = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toNotificationView),
      nextCursor: hasNext && last ? encodeNotificationCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }
}
