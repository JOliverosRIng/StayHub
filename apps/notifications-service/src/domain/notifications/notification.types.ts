export const NOTIFICATION_TYPES = ['BOOKING_CONFIRMATION', 'CHECKIN_REMINDER', 'SYSTEM_ALERT'] as const;
export const NOTIFICATION_CHANNELS = ['EMAIL', 'IN_APP'] as const;
export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];
export type NotificationStatus = typeof NOTIFICATION_STATUSES[number];

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipientEmail: string | null;
  subject: string;
  body: string;
  status: NotificationStatus;
  failureReason: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  createdAt: Date;
  sentAt: Date | null;
}

export type TemplateData = Record<string, string | number>;
export interface RenderedNotification { subject: string; body: string; data: TemplateData }
export type NotificationView = Omit<NotificationRecord, 'recipientEmail' | 'failureReason' | 'idempotencyKey' | 'requestFingerprint'>;

export function toNotificationView(record: NotificationRecord): NotificationView {
  return {
    id: record.id, userId: record.userId, type: record.type, channel: record.channel,
    subject: record.subject, body: record.body, status: record.status,
    createdAt: record.createdAt, sentAt: record.sentAt,
  };
}
