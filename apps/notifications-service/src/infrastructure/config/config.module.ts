import { Global, Module } from '@nestjs/common';
import { loadNotificationsConfig, NOTIFICATIONS_CONFIG } from './notifications-config';

@Global()
@Module({
  providers: [{ provide: NOTIFICATIONS_CONFIG, useFactory: loadNotificationsConfig }],
  exports: [NOTIFICATIONS_CONFIG],
})
export class ConfigModule {}
