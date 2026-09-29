import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { USERS_CONFIG, loadUsersConfig, type UsersConfig } from './infrastructure/config/users-config';

async function bootstrap(): Promise<void> {
  loadUsersConfig();
  const app = await NestFactory.create(AppModule);
  const config = app.get<UsersConfig>(USERS_CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', service: 'users-service', message: error instanceof Error ? error.message : 'startup failed' })}\n`,
  );
  process.exitCode = 1;
});
