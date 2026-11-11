import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { RabbitMqPaymentConsumer } from '@bookings/infrastructure/messaging/rabbitmq-payment.consumer';
import { NotificationDeliveryHealth } from '@bookings/infrastructure/observability/notification-delivery-health';

type DependencyState = 'up' | 'down' | 'degraded' | 'unknown';

export interface ReadinessView {
  status: 'ready' | 'degraded' | 'not_ready';
  database: DependencyState;
  paymentsEvents: DependencyState;
  notifications: DependencyState;
  canConfirmPayments: boolean;
  notificationsLastSuccessAt: string | null;
  notificationsLastErrorCode: string | null;
}

@Controller('health')
export class HealthController {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsEvents: RabbitMqPaymentConsumer,
    private readonly notifications: NotificationDeliveryHealth,
  ) {}

  @Get('live')
  public live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  public async ready(): Promise<ReadinessView> {
    const database = await this.prisma.isReady() ? 'up' : 'down';
    const paymentsEvents = this.paymentsEvents.isHealthy() ? 'up' : 'down';
    const notifications = this.notifications.snapshot();
    const canConfirmPayments = database === 'up' && paymentsEvents === 'up';
    const view: ReadinessView = {
      status: !canConfirmPayments ? 'not_ready' : notifications.state === 'degraded' ? 'degraded' : 'ready',
      database,
      paymentsEvents,
      notifications: notifications.state,
      canConfirmPayments,
      notificationsLastSuccessAt: notifications.lastSuccessAt,
      notificationsLastErrorCode: notifications.lastErrorCode,
    };
    if (!canConfirmPayments) throw new ServiceUnavailableException(view);
    return view;
  }
}
