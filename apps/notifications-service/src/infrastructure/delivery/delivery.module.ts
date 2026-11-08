import { Global, Module } from '@nestjs/common';
import { DELIVERY_ADAPTERS, type DeliveryPort } from '../../application/ports/delivery.port';
import { FakeEmailAdapter } from './fake-email.adapter';
import { InAppAdapter } from './in-app.adapter';
import { SmtpEmailAdapter } from './smtp-email.adapter';
import { NOTIFICATIONS_CONFIG, type NotificationsConfig } from '../config/notifications-config';

@Global()
@Module({
  providers: [
    { provide: FakeEmailAdapter, useFactory: (): FakeEmailAdapter => new FakeEmailAdapter() },
    { provide: SmtpEmailAdapter, useFactory: (config: NotificationsConfig): SmtpEmailAdapter => new SmtpEmailAdapter(config), inject: [NOTIFICATIONS_CONFIG] },
    { provide: InAppAdapter, useFactory: (): InAppAdapter => new InAppAdapter() },
    { provide: DELIVERY_ADAPTERS, useFactory: (config: NotificationsConfig, stub: FakeEmailAdapter, smtp: SmtpEmailAdapter, inApp: InAppAdapter): DeliveryPort[] => [config.email.mode === 'smtp' ? smtp : stub, inApp], inject: [NOTIFICATIONS_CONFIG, FakeEmailAdapter, SmtpEmailAdapter, InAppAdapter] },
  ],
  exports: [DELIVERY_ADAPTERS],
})
export class DeliveryModule {}
