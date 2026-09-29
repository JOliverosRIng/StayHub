import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AUTH_CONFIG, loadAuthConfig, type AuthConfig } from './infrastructure/config/auth-config';
import { startTelemetry, stopTelemetry } from './infrastructure/observability/otel';
import { registerShutdownHooks } from './infrastructure/observability/shutdown';
import { startupFailureRecord } from './infrastructure/observability/startup';
import { configureAuthHttp } from './interfaces/http/configure-auth-http';

async function bootstrap(): Promise<void> {
  const initialConfig = loadAuthConfig();
  startTelemetry(initialConfig);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AuthConfig>(AUTH_CONFIG);
  configureAuthHttp(app);
  app.enableShutdownHooks();
  registerShutdownHooks(app, stopTelemetry);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap().catch(async (error: unknown) => {
  process.stderr.write(`${JSON.stringify(startupFailureRecord(error))}\n`);
  await stopTelemetry();
  process.exitCode = 1;
});
