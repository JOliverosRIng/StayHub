import 'reflect-metadata';
import { loadSearchConfig } from './infrastructure/config/search-config';
import { startTelemetry, stopTelemetry } from './infrastructure/observability/otel';
import { SearchLogger } from './infrastructure/observability/search-logger';

async function bootstrap(): Promise<void> {
  const logger = new SearchLogger();
  try {
    const config = loadSearchConfig();
    logger.setLevel(config.logLevel);
    startTelemetry(config);
    // Load application modules after registering telemetry providers.
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('./app.module');
    const { configureSearchHttp } = await import('./interfaces/http/configure-search-http');
    const { registerShutdown } = await import('./infrastructure/lifecycle/graceful-shutdown');
    const { ShutdownState } = await import('./infrastructure/lifecycle/shutdown-state');
    const { createSearchOpenApi } = await import('./interfaces/openapi/openapi.factory');
    const { SwaggerModule } = await import('@nestjs/swagger');
    const app = await NestFactory.create(AppModule, { logger, abortOnError: false });
    configureSearchHttp(app, logger);
    SwaggerModule.setup('docs', app, createSearchOpenApi(app));
    registerShutdown(app, app.get(ShutdownState), config.shutdownGraceMs, stopTelemetry, logger);
    try { await app.listen(config.port, '0.0.0.0'); }
    catch (error) { await app.close(); throw error; }
  } catch {
    logger.error('startup.failed');
    await stopTelemetry().catch(() => logger.warn('telemetry.shutdown.failed'));
    process.exitCode = 1;
  }
}
void bootstrap();
