import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const USERS_SERVICE_PORT = 3002;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(USERS_SERVICE_PORT, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', service: 'users-service', message: error instanceof Error ? error.message : 'startup failed' })}\n`,
  );
  process.exitCode = 1;
});
