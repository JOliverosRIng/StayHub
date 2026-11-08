import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NOTIFICATIONS_CONFIG, type NotificationsConfig } from './infrastructure/config/notifications-config';
import { NotificationsLogger } from './infrastructure/logging/notifications-logger';
import { configureHttp } from './interfaces/http/configure-http';

async function bootstrap(): Promise<void> {
  const logger = new NotificationsLogger();
  const app = await NestFactory.create(AppModule, { logger });
  configureHttp(app);
  const config = app.get<NotificationsConfig>(NOTIFICATIONS_CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  logger.log({ message: 'service listening', port: config.port });
}

void bootstrap().catch(() => {
  process.stderr.write(`${JSON.stringify({
    level: 'fatal',
    service: 'notifications-service',
    message: 'startup failed; verify service configuration',
  })}\n`);
  process.exitCode = 1;
});
