import type { DeliveryPort } from '../ports/delivery.port';
import type { NotificationRepository } from '../ports/notification.repository';
import { fingerprintRequest, renderNotification } from '../../domain/notifications/notification.policy';
import type { NotificationChannel, NotificationType, NotificationView } from '../../domain/notifications/notification.types';
import { toNotificationView } from '../../domain/notifications/notification.types';

export interface SendNotificationCommand {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipientEmail?: string;
  templateData: unknown;
  idempotencyKey: string;
}

export class NotificationStorageError extends Error {
  readonly code = 'NOTIFICATION_STORAGE_UNAVAILABLE';
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
}

export interface SendNotificationResult { notification: NotificationView; replayed: boolean }

export class SendNotificationUseCase {
  constructor(private readonly repository: NotificationRepository, private readonly delivery: DeliveryPort[], private readonly now: () => Date = () => new Date()) {}

  async execute(command: SendNotificationCommand): Promise<SendNotificationResult> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.userId)) throw new Error('Invalid user id');
    if (!/^[\x21-\x7e]{1,128}$/.test(command.idempotencyKey)) throw new Error('Invalid idempotency key');
    if (command.channel === 'EMAIL') {
      if (!command.recipientEmail || command.recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(command.recipientEmail)) throw new Error('Valid recipient email required');
    } else if (command.recipientEmail !== undefined) throw new Error('recipientEmail is only valid for EMAIL');

    const rendered = renderNotification(command.type, command.templateData);
    if (rendered.subject.length > 120 || rendered.body.length > 5000) throw new Error('Rendered content exceeds limit');
    const adapter = this.delivery.find((candidate) => candidate.channel === command.channel);
    if (!adapter) throw new Error('Delivery adapter unavailable');
    const fingerprint = fingerprintRequest({ userId: command.userId, type: command.type, channel: command.channel, ...(command.recipientEmail ? { recipientEmail: command.recipientEmail } : {}), data: rendered.data });
    let reservation;
    try {
      reservation = await this.repository.findByIdempotencyKeyOrCreate({
        userId: command.userId, type: command.type, channel: command.channel,
        recipientEmail: command.channel === 'EMAIL' ? command.recipientEmail!.trim().toLowerCase() : null,
        subject: rendered.subject, body: rendered.body, status: 'PENDING', failureReason: null,
        idempotencyKey: command.idempotencyKey, requestFingerprint: fingerprint, sentAt: null,
      });
      if (!reservation.created) {
        if (reservation.record.requestFingerprint !== fingerprint) throw new IdempotencyConflictError('Idempotency key is already bound to different content');
        return { notification: toNotificationView(reservation.record), replayed: true };
      }
      const record = reservation.record;
      if (command.channel === 'IN_APP') return { notification: toNotificationView(await this.repository.updateDelivery(record.id, 'SENT', this.now(), null)), replayed: false };
      let result;
      try { result = await adapter.deliver({ recipientEmail: record.recipientEmail, subject: record.subject, body: record.body }); }
      catch { result = { accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' as const }; }
      return { notification: toNotificationView(await this.repository.updateDelivery(
        record.id, result.accepted ? 'SENT' : 'FAILED', result.accepted ? this.now() : null,
        result.accepted ? null : result.failureCode ?? 'DELIVERY_UNAVAILABLE',
      )), replayed: false };
    } catch (error) {
      if (error instanceof IdempotencyConflictError) throw error;
      if (error instanceof Error && error.message === 'Invalid notification status transition') throw error;
      throw new NotificationStorageError('Notification storage operation failed');
    }
  }
}
