import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AUTH_CONFIG, loadAuthConfig, type AuthConfig } from './infrastructure/config/auth-config';
import { AuthLogger } from './infrastructure/observability/auth-logger';
import { startTelemetry, stopTelemetry } from './infrastructure/observability/otel';
import { ProblemDetailsFilter } from './interfaces/http/problem.filter';
import { TraceInterceptor } from './interfaces/http/trace.interceptor';
import { createValidationPipe } from './interfaces/http/validation.pipe';
import { mountAuthSwagger } from './interfaces/openapi/openapi.factory';

async function bootstrap(): Promise<void> {
  const initialConfig = loadAuthConfig();
  startTelemetry(initialConfig);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AuthConfig>(AUTH_CONFIG);
  const logger = app.get(AuthLogger);
  app.useLogger(logger);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalInterceptors(app.get(TraceInterceptor, { strict: false }));
  app.useGlobalFilters(new ProblemDetailsFilter(logger));
  app.enableShutdownHooks();
  mountAuthSwagger(app, config.environment);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap().catch(async (error: unknown) => {
  process.stderr.write(`${JSON.stringify({ level: 'fatal', service: 'auth-service', message: error instanceof Error ? error.message : 'startup failed' })}\n`);
  await stopTelemetry();
  process.exitCode = 1;
});
