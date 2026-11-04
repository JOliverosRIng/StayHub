import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { loadAccommodationsConfig } from './infrastructure/config/accommodations-config';
import { createTelemetry } from './infrastructure/observability/otel';
import { configureHttp } from './interfaces/http/configure-http';
import { createOpenApi } from './interfaces/openapi/openapi.factory';

async function bootstrap(): Promise<void> {
  const config = loadAccommodationsConfig();
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
    `${JSON.stringify({ level: 'fatal', service: 'accommodations-service', message: 'startup failed; verify configuration and database' })}\n`,
  );
  process.exitCode = 1;
});
