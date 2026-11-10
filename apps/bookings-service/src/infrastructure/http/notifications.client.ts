import { Inject, Injectable } from '@nestjs/common';
import {
  NotificationDeliveryError,
  type BookingConfirmedNotification,
  type BookingNotificationsPort,
} from '@bookings/application/ports/booking-notifications.port';
import { SERVICE_TOKEN_PORT, type ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { NotificationDeliveryHealth } from '@bookings/infrastructure/observability/notification-delivery-health';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validResponse(body: unknown, command: BookingConfirmedNotification): boolean {
  if (!isRecord(body) || !isRecord(body.confirmation)) return false;
  const confirmation = body.confirmation;
  return UUID.test(String(confirmation.id))
    && confirmation.userId === command.userId
    && confirmation.type === 'BOOKING_CONFIRMATION'
    && confirmation.channel === 'IN_APP'
    && confirmation.status === 'SENT'
    && typeof body.reminderScheduledAt === 'string'
    && !Number.isNaN(Date.parse(body.reminderScheduledAt));
}

@Injectable()
export class NotificationsClient implements BookingNotificationsPort {
  public constructor(
    @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig,
    @Inject(SERVICE_TOKEN_PORT) private readonly tokens: ServiceTokenPort,
    private readonly health: NotificationDeliveryHealth,
  ) {}

  public async sendBookingConfirmed(command: BookingConfirmedNotification): Promise<void> {
    try {
      await this.deliver(command);
      this.health.recordSuccess();
    } catch (error) {
      this.health.recordFailure(error instanceof NotificationDeliveryError ? error.code : 'NOTIFICATIONS_UNAVAILABLE');
      throw error;
    }
  }

  private async deliver(command: BookingConfirmedNotification): Promise<void> {
    const token = await this.tokens.getToken(this.config.notificationsJwtAudience, this.config.notificationsJwtScope);
    let response: Response;
    try {
      response = await fetch(`${this.config.notificationsUrl}/notifications/events/booking-confirmed`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.config.notificationsTimeoutMs),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(command),
      });
    } catch {
      throw new NotificationDeliveryError('RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE');
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_UNAUTHORIZED');
      if (response.status === 409) throw new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_CONFLICT');
      if (response.status === 400) throw new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_REJECTED');
      if (response.status === 429 || response.status >= 500) throw new NotificationDeliveryError('RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE');
      throw new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_REJECTED');
    }

    if (response.status !== 200 && response.status !== 201) throw new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_INVALID_RESPONSE');
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_INVALID_RESPONSE');
    }
    if (!validResponse(body, command)) throw new NotificationDeliveryError('PERMANENT', 'NOTIFICATIONS_INVALID_RESPONSE');
  }
}
