import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadUsersConfig } from './infrastructure/config/users-config';
import { createTelemetry } from './infrastructure/observability/otel';
import { configureHttp } from './interfaces/http/configure-http';
import { createOpenApi } from './interfaces/openapi/openapi.factory';
import { SwaggerModule } from '@nestjs/swagger';

async function bootstrap(): Promise<void> {
  const config = loadUsersConfig();
  const telemetry = createTelemetry(config.otlpEndpoint);
  const app = await NestFactory.create(AppModule, { logger: telemetry.logger });
  configureHttp(app, telemetry.logger);
  if (config.development) SwaggerModule.setup('docs', app, createOpenApi(app));
  app.enableShutdownHooks();
  process.once('beforeExit', () => { void telemetry.shutdown(); });
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap().catch(() => {
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', service: 'users-service', message: 'startup failed; verify configuration and database' })}\n`,
  );
  process.exitCode = 1;
});
