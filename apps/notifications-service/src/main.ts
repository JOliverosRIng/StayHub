import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NOTIFICATIONS_CONFIG, type NotificationsConfig } from './infrastructure/config/notifications-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = app.get<NotificationsConfig>(NOTIFICATIONS_CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  process.stdout.write(`${JSON.stringify({
    level: 'info',
    service: 'notifications-service',
    message: 'service listening',
    port: config.port,
  })}\n`);
}

void bootstrap().catch(() => {
  process.stderr.write(`${JSON.stringify({
    level: 'fatal',
    service: 'notifications-service',
    message: 'startup failed; verify service configuration',
  })}\n`);
  process.exitCode = 1;
});
